<script>
  import { onMount } from 'svelte'
  import axios from 'axios'
  import { io } from 'socket.io-client'

  let apiBase = $state('http://localhost:3000')
  let question = $state(
    'Order #45 của tôi đến đâu rồi? tôi muốn nói chuyện với nhân viên hỗ trợ đc ko'
  )
  let selectedMode = $state('all') // 'all' | 'langchain' | 'raw' | 'mastra'
  let isSubmitting = $state(false)

  // Socket.io
  let socket = $state(null)
  let socketConnected = $state(false)
  let socketId = $state(null)
  // Active view tab per card: 'answer' | 'logs'
  let cardTabs = $state({
    langchain: 'answer',
    raw: 'answer',
    'raw-aisdk': 'answer',
    mastra: 'answer',
  })

  // Real-time logs streamed from socket.io
  let flowLogs = $state({
    langchain: [],
    raw: [],
    'raw-aisdk': [],
    mastra: [],
  })

  let results = $state({
    langchain: { loading: false, answer: null, error: null, duration: null },
    raw: { loading: false, answer: null, error: null, duration: null },
    'raw-aisdk': { loading: false, answer: null, error: null, duration: null },
    mastra: { loading: false, answer: null, error: null, duration: null },
  })

  let copied = $state({
    langchain: false,
    raw: false,
    'raw-aisdk': false,
    mastra: false,
  })

  const modes = [
    { id: 'all', label: 'Call cả 4 (So sánh)', icon: '⚡', desc: 'Chạy song song 4 flow' },
    { id: 'langchain', label: 'LangChain', icon: '🦜', desc: 'LangChain createAgent' },
    { id: 'raw', label: 'Raw (Loop)', icon: '⚙️', desc: 'Tự code vòng lặp while' },
    { id: 'raw-aisdk', label: 'Raw (AI SDK)', icon: '🤖', desc: 'Vercel AI SDK (maxSteps)' },
    { id: 'mastra', label: 'Mastra', icon: '🦊', desc: 'Mastra Agent Core' },
  ]

  const sampleQuestions = [
    {
      title: 'Đơn hàng & Nhân viên (2 Tools)',
      q: 'Order #45 của tôi đến đâu rồi? tôi muốn nói chuyện với nhân viên hỗ trợ đc ko',
    },
    {
      title: 'Tìm sản phẩm (1 Tool)',
      q: 'Shop có bán giày Nike Air Max 270 không, giá bao nhiêu và còn hàng không?',
    },
    {
      title: 'Trigger cả 4 Tools',
      q: 'Kiểm tra giúp tôi đơn hàng #DH8888 xem khi nào giao, tìm xem shop còn giày Nike Air Max 270 giá bao nhiêu, tiện thể tra cứu trên mạng xem thời tiết Hà Nội hôm nay thế nào, và chuyển máy cho tôi gặp trực tiếp nhân viên hỗ trợ người thật nhé.',
    },
    {
      title: 'Hỏi ngoài lề (Không gọi tool)',
      q: 'Chào shop, shop mở cửa vào những khung giờ nào?',
    },
  ]

  function connectSocket(url) {
    if (socket) {
      socket.disconnect()
    }

    try {
      socket = io(url, {
        reconnectionAttempts: 5,
        timeout: 10000,
      })

      socket.on('connect', () => {
        socketConnected = true
        socketId = socket.id
        console.log('[Socket.io] Connected:', socket.id)
      })

      socket.on('disconnect', () => {
        socketConnected = false
        console.log('[Socket.io] Disconnected')
      })

      socket.on('flow:log', (log) => {
        if (log && log.flow && flowLogs[log.flow]) {
          flowLogs[log.flow] = [...flowLogs[log.flow], log]
        }
      })
    } catch (err) {
      console.error('[Socket.io] Error connecting:', err)
    }
  }

  // Tools catalog state
  let tools = $state([])
  let toolsLoading = $state(true)
  let toolsError = $state(null)
  let toolSearch = $state('')
  let isSidebarOpen = $state(true)
  let copiedOutputs = $state({})
  let copiedToolNames = $state({})

  async function fetchTools() {
    toolsLoading = true
    toolsError = null
    try {
      const response = await axios.get(`${apiBase}/tools`, { timeout: 10000 })
      tools = response.data?.tools || []
    } catch (err) {
      toolsError =
        err.response?.data?.error || err.message || 'Không thể lấy danh sách tools từ server'
    } finally {
      toolsLoading = false
    }
  }

  function copyToolName(name) {
    navigator.clipboard.writeText(name)
    copiedToolNames[name] = true
    setTimeout(() => {
      copiedToolNames[name] = false
    }, 2000)
  }

  function copyToolOutput(name, output) {
    navigator.clipboard.writeText(JSON.stringify(output, null, 2))
    copiedOutputs[name] = true
    setTimeout(() => {
      copiedOutputs[name] = false
    }, 2000)
  }

  const filteredTools = $derived(
    tools.filter((t) => {
      if (!toolSearch.trim()) return true
      const q = toolSearch.toLowerCase()
      return (
        t.name.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      )
    })
  )

  onMount(() => {
    connectSocket(apiBase)
    fetchTools()
    return () => {
      if (socket) socket.disconnect()
    }
  })

  async function fetchFlow(flowName, q) {
    results[flowName].loading = true
    results[flowName].error = null
    results[flowName].answer = null
    results[flowName].duration = null
    flowLogs[flowName] = []

    const startTime = performance.now()

    try {
      const response = await axios.get(`${apiBase}/${flowName}`, {
        params: {
          q,
          sessionId: socketId || undefined,
        },
        timeout: 90000,
      })

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2)
      const rawAnswer = response.data?.answer
      results[flowName].answer =
        typeof rawAnswer === 'string'
          ? rawAnswer
          : rawAnswer !== undefined
            ? JSON.stringify(rawAnswer)
            : JSON.stringify(response.data)
      results[flowName].duration = elapsed
    } catch (err) {
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2)
      results[flowName].duration = elapsed
      results[flowName].error =
        err.response?.data?.error || err.message || 'Lỗi kết nối đến server'
    } finally {
      results[flowName].loading = false
    }
  }

  async function handleSubmit(e) {
    if (e) e.preventDefault()
    const trimmed = question.trim()
    if (!trimmed || isSubmitting) return

    isSubmitting = true

    if (selectedMode === 'all') {
      await Promise.allSettled([
        fetchFlow('langchain', trimmed),
        fetchFlow('raw', trimmed),
        fetchFlow('raw-aisdk', trimmed),
        fetchFlow('mastra', trimmed),
      ])
    } else {
      await fetchFlow(selectedMode, trimmed)
    }

    isSubmitting = false
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSubmit()
    }
  }

  function copyAnswer(flowName) {
    const text = results[flowName]?.answer
    if (!text) return
    navigator.clipboard.writeText(text)
    copied[flowName] = true
    setTimeout(() => {
      copied[flowName] = false
    }, 2000)
  }

  function formatLogData(data) {
    if (data === null || data === undefined) return ''
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data)
        return JSON.stringify(parsed, null, 2)
      } catch {
        return data
      }
    }
    return JSON.stringify(data, null, 2)
  }

  const activeCards = $derived(
    selectedMode === 'all'
      ? ['langchain', 'raw', 'raw-aisdk', 'mastra']
      : [selectedMode]
  )
</script>

<div class="app-layout">
  <!-- TOOLS SIDEBAR (LEFT) -->
  <aside class="sidebar {isSidebarOpen ? 'open' : 'collapsed'}">
    {#if isSidebarOpen}
      <div class="sidebar-header">
        <div class="sidebar-title-row">
          <div class="sidebar-title">
            <span class="sidebar-icon">🛠️</span>
            <div>
              <h2>Tools & Outputs</h2>
              <span class="sidebar-sub-mini">Danh sách tool & mock data ({tools.length})</span>
            </div>
          </div>
          <div class="sidebar-header-btns">
            <button
              type="button"
              class="icon-btn"
              onclick={fetchTools}
              title="Tải lại danh sách tools"
            >
              🔄
            </button>
            <button
              type="button"
              class="icon-btn collapse-toggle"
              onclick={() => (isSidebarOpen = false)}
              title="Thu gọn sidebar"
            >
              ◀
            </button>
          </div>
        </div>

        <div class="sidebar-search-row">
          <input
            type="text"
            class="sidebar-search-input"
            bind:value={toolSearch}
            placeholder="Tìm tool hoặc tham số..."
          />
          {#if toolSearch}
            <button
              type="button"
              class="sidebar-search-clear"
              onclick={() => (toolSearch = '')}
            >
              ✕
            </button>
          {/if}
        </div>
      </div>

      <div class="sidebar-body">
        {#if toolsLoading}
          <div class="sidebar-loading">
            <span class="spinner-small"></span> Đang tải tools từ server...
          </div>
        {:else if toolsError}
          <div class="sidebar-error-box">
            <p><strong>Lỗi:</strong> {toolsError}</p>
            <button type="button" class="retry-btn" onclick={fetchTools}>
              Thử lại
            </button>
          </div>
        {:else if filteredTools.length === 0}
          <div class="sidebar-empty">
            {toolSearch ? `Không tìm thấy tool nào khớp "${toolSearch}"` : 'Không có tool nào.'}
          </div>
        {:else}
          <div class="tool-cards-list">
            {#each filteredTools as tool}
              <div class="tool-card">
                <div class="tool-card-top">
                  <span class="tool-card-name">{tool.name}</span>
                  <button
                    type="button"
                    class="tool-copy-name-btn"
                    onclick={() => copyToolName(tool.name)}
                    title="Copy tên tool"
                  >
                    {copiedToolNames[tool.name] ? '✓ Copied' : 'Copy'}
                  </button>
                </div>

                <p class="tool-card-desc">{tool.description}</p>

                {#if tool.parameters && tool.parameters.length > 0}
                  <div class="tool-section">
                    <span class="tool-section-title">📥 Parameters ({tool.parameters.length}):</span>
                    <div class="params-box">
                      {#each tool.parameters as p}
                        <div class="param-row">
                          <div class="param-head">
                            <span class="param-field">{p.name}</span>
                            <span class="param-type-badge">{p.type}</span>
                            <span class="param-req-badge {p.required ? 'req' : 'opt'}">
                              {p.required ? 'required' : 'optional'}
                            </span>
                          </div>
                          {#if p.description}
                            <span class="param-desc-text">{p.description}</span>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}

                <div class="tool-section">
                  <div class="tool-section-head">
                    <span class="tool-section-title">📤 Mock Output:</span>
                    <button
                      type="button"
                      class="tool-copy-output-btn"
                      onclick={() => copyToolOutput(tool.name, tool.output)}
                      title="Copy output JSON"
                    >
                      {copiedOutputs[tool.name] ? '✓ Copied Output' : 'Copy Output'}
                    </button>
                  </div>
                  <pre class="tool-output-block"><code>{JSON.stringify(tool.output, null, 2)}</code></pre>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <!-- COLLAPSED STRIP -->
      <div class="collapsed-sidebar">
        <button
          type="button"
          class="sidebar-expand-action"
          onclick={() => (isSidebarOpen = true)}
          title="Mở Sidebar Tools"
        >
          <span class="expand-arrow">▶</span>
          <span class="collapsed-title">🛠️ Tools ({tools.length})</span>
        </button>
      </div>
    {/if}
  </aside>

  <!-- MAIN PLAYGROUND -->
  <main class="main-content">
    <div class="container">
      <!-- HEADER -->
      <header class="header">
        <div class="header-left">
          {#if !isSidebarOpen}
            <button
              type="button"
              class="open-sidebar-pill"
              onclick={() => (isSidebarOpen = true)}
              title="Mở Sidebar Tools"
            >
              🛠️ Tools ({tools.length})
            </button>
          {/if}
          <div class="header-content">
            <div class="title-row">
              <h1>Agent RAG Playground</h1>
              <span class="socket-pill {socketConnected ? 'connected' : 'disconnected'}">
                <span class="socket-dot"></span>
                {socketConnected ? 'Socket.io Live' : 'Socket Offline'}
              </span>
            </div>
            <p class="subtitle">
              So sánh kết quả thực thi và Stream live progress của 3 framework: <strong>LangChain</strong>, <strong>Raw (OpenAI)</strong>, và <strong>Mastra</strong>
            </p>
          </div>
        </div>
        <div class="server-config">
          <label for="server-url">Server:</label>
          <input
            id="server-url"
            type="text"
            bind:value={apiBase}
            onchange={() => {
              connectSocket(apiBase)
              fetchTools()
            }}
            placeholder="http://localhost:3000"
          />
        </div>
      </header>

  <!-- FORM SECTION -->
  <section class="card form-section">
    <!-- MODE SELECTOR -->
    <div class="mode-header">
      <span class="label-title">Chọn chế độ gọi API (4 options):</span>
    </div>
    <div class="mode-grid">
      {#each modes as m}
        <button
          type="button"
          class="mode-btn {selectedMode === m.id ? 'active' : ''}"
          onclick={() => (selectedMode = m.id)}
        >
          <span class="mode-icon">{m.icon}</span>
          <div class="mode-info">
            <span class="mode-label">{m.label}</span>
            <span class="mode-desc">{m.desc}</span>
          </div>
        </button>
      {/each}
    </div>

    <!-- QUESTION INPUT -->
    <div class="input-group">
      <div class="input-header">
        <label for="question-input">Câu hỏi của người dùng:</label>
        <span class="tip">Phím tắt: <code>Ctrl</code> + <code>Enter</code> để gửi</span>
      </div>
      <textarea
        id="question-input"
        bind:value={question}
        onkeydown={handleKeyDown}
        rows="3"
        placeholder="Nhập câu hỏi cần test..."
      ></textarea>
    </div>

    <!-- SAMPLE QUESTIONS -->
    <div class="samples">
      <span class="sample-label">Gợi ý câu hỏi:</span>
      <div class="sample-pills">
        {#each sampleQuestions as sample}
          <button
            type="button"
            class="pill-btn"
            onclick={() => {
              question = sample.q
            }}
          >
            {sample.title}
          </button>
        {/each}
      </div>
    </div>

    <!-- SUBMIT BUTTON -->
    <div class="actions">
      <button
        type="button"
        class="submit-btn"
        disabled={isSubmitting || !question.trim()}
        onclick={handleSubmit}
      >
        {#if isSubmitting}
          <span class="spinner"></span> Đang chạy & stream logs...
        {:else if selectedMode === 'all'}
          ⚡ Gửi đến cả 4 Flow
        {:else}
          🚀 Gửi đến {selectedMode.toUpperCase()}
        {/if}
      </button>
    </div>
  </section>

  <!-- RESULTS SECTION -->
  <section class="results-section">
    <div class="results-grid {selectedMode === 'all' ? 'multi-columns' : 'single-column'}">
      {#each activeCards as flowKey}
        {@const card = results[flowKey]}
        {@const logs = flowLogs[flowKey] || []}
        {@const isRaw = flowKey === 'raw'}
        {@const isAiSdk = flowKey === 'raw-aisdk'}
        {@const isLang = flowKey === 'langchain'}
        {@const isMastra = flowKey === 'mastra'}
        {@const flowTitle = isLang ? 'LangChain' : isRaw ? 'Raw (Loop)' : isAiSdk ? 'Raw (AI SDK)' : 'Mastra'}
        {@const icon = isLang ? '🦜' : isRaw ? '⚙️' : isAiSdk ? '🤖' : '🦊'}

        <div class="card result-card {card.loading ? 'loading' : ''}">
          <!-- CARD HEADER -->
          <div class="card-header">
            <div class="card-title">
              <span class="card-icon">{icon}</span>
              <h3>{flowTitle}</h3>
              <span class="endpoint-badge">/{flowKey}</span>
            </div>

            <div class="card-meta">
              {#if card.duration}
                <span class="duration-badge">⏱️ {card.duration}s</span>
              {/if}
              {#if card.answer}
                <button
                  type="button"
                  class="copy-btn"
                  onclick={() => copyAnswer(flowKey)}
                  title="Sao chép câu trả lời"
                >
                  {copied[flowKey] ? '✓ Đã chép' : 'Sao chép'}
                </button>
              {/if}
            </div>
          </div>

          <!-- CARD TABS (Answer vs Live Logs) -->
          <div class="card-tabs">
            <button
              type="button"
              class="tab-btn {cardTabs[flowKey] === 'answer' ? 'active' : ''}"
              onclick={() => (cardTabs[flowKey] = 'answer')}
            >
              💬 Câu trả lời
            </button>
            <button
              type="button"
              class="tab-btn {cardTabs[flowKey] === 'logs' ? 'active' : ''}"
              onclick={() => (cardTabs[flowKey] = 'logs')}
            >
              📜 Live Logs
              {#if logs.length > 0}
                <span class="log-count">{logs.length}</span>
              {/if}
              {#if card.loading}
                <span class="live-dot"></span>
              {/if}
            </button>
          </div>

          <!-- CARD BODY -->
          <div class="card-body">
            {#if cardTabs[flowKey] === 'answer'}
              <!-- ANSWER VIEW -->
              {#if card.loading}
                <div class="loading-state">
                  <div class="pulsing-bar"></div>
                  <p>Đang thực thi Tool Calling & LLM...</p>
                  {#if logs.length > 0}
                    <div class="latest-log-preview">
                      <span class="log-type-tag {logs[logs.length - 1].type}">
                        {logs[logs.length - 1].type}
                      </span>
                      <span class="preview-msg">{logs[logs.length - 1].message}</span>
                    </div>
                  {/if}
                </div>
              {:else if card.error}
                <div class="error-box">
                  <strong>Lỗi thực thi:</strong>
                  <p>{card.error}</p>
                </div>
              {:else if card.answer}
                <div class="answer-box">
                  <p class="answer-text">{card.answer}</p>
                </div>
              {:else}
                <div class="empty-state">
                  <p>Chưa có câu trả lời. Nhập câu hỏi và nhấn gửi.</p>
                </div>
              {/if}
            {:else}
              <!-- LIVE LOGS VIEW (EXPANDS NATURALLY VERTICALLY) -->
              <div class="log-console">
                {#if logs.length === 0}
                  <div class="log-empty">
                    {#if card.loading}
                      <span class="spinner-small"></span> Đang chờ log từ server...
                    {:else}
                      Chưa có log. Khi gửi câu hỏi, tiến trình sẽ stream vào đây.
                    {/if}
                  </div>
                {:else}
                  <div class="log-stream">
                    {#each logs as logItem}
                      <div class="log-entry">
                        <div class="log-meta">
                          <span class="log-time">{logItem.timestamp}</span>
                          <span class="log-badge {logItem.type}">
                            {logItem.type}
                          </span>
                        </div>
                        <div class="log-content">
                          <span class="log-msg">{logItem.message}</span>
                          {#if logItem.data}
                            <pre class="log-data">{formatLogData(logItem.data)}</pre>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </section>
</div>
</main>
</div>

<style>
  /* LAYOUT */
  .app-layout {
    display: flex;
    width: 100%;
    min-height: 100vh;
    min-width: 0;
    position: relative;
    background-color: var(--bg-primary);
  }

  /* SIDEBAR */
  .sidebar {
    position: sticky;
    top: 0;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: #0b0f19;
    border-right: 1px solid var(--border);
    flex-shrink: 0;
    z-index: 30;
    transition: width 0.2s ease;
  }

  .sidebar.open {
    width: 380px;
    min-width: 340px;
    max-width: 400px;
  }

  .sidebar.collapsed {
    width: 44px;
    min-width: 44px;
    background-color: #090d16;
  }

  .sidebar-header {
    padding: 16px;
    border-bottom: 1px solid var(--border);
    background-color: #0d121f;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .sidebar-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .sidebar-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sidebar-title h2 {
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    margin: 0;
    line-height: 1.2;
  }

  .sidebar-sub-mini {
    font-size: 11px;
    color: var(--text-muted);
  }

  .sidebar-icon {
    font-size: 18px;
  }

  .sidebar-header-btns {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .icon-btn {
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    border-radius: 6px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  }

  .icon-btn:hover {
    color: #fff;
    border-color: var(--accent);
    background-color: var(--accent-light);
  }

  .sidebar-search-row {
    position: relative;
    width: 100%;
  }

  .sidebar-search-input {
    width: 100%;
    padding: 6px 28px 6px 10px;
    font-size: 12px;
    background-color: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-primary);
  }

  .sidebar-search-input:focus {
    border-color: var(--accent);
  }

  .sidebar-search-clear {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 11px;
    padding: 2px 4px;
  }

  .sidebar-search-clear:hover {
    color: #fff;
  }

  .sidebar-body {
    flex: 1;
    overflow-y: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .sidebar-loading, .sidebar-empty {
    text-align: center;
    padding: 24px 12px;
    font-size: 13px;
    color: var(--text-muted);
  }

  .sidebar-error-box {
    background-color: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    padding: 12px;
    border-radius: 6px;
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .retry-btn {
    align-self: flex-start;
    font-size: 11px;
    background: var(--bg-input);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #fff;
    padding: 4px 10px;
    border-radius: 4px;
  }

  .tool-cards-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .tool-card {
    background-color: #131b2e;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tool-card:hover {
    border-color: rgba(99, 102, 241, 0.5);
  }

  .tool-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .tool-card-name {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
    word-break: break-all;
  }

  .tool-copy-name-btn {
    font-size: 11px;
    padding: 2px 8px;
    background-color: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    border-radius: 4px;
    flex-shrink: 0;
  }

  .tool-copy-name-btn:hover {
    color: #fff;
    border-color: var(--text-secondary);
  }

  .tool-card-desc {
    font-size: 12px;
    color: #cbd5e1;
    line-height: 1.45;
  }

  .tool-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tool-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .tool-section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-muted);
  }

  .tool-copy-output-btn {
    font-size: 10px;
    padding: 2px 6px;
    background-color: var(--bg-input);
    border: 1px solid var(--border);
    color: #34d399;
    border-radius: 4px;
  }

  .tool-copy-output-btn:hover {
    background-color: rgba(16, 185, 129, 0.15);
    border-color: #34d399;
  }

  .params-box {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background-color: #0b0f19;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    padding: 6px 8px;
  }

  .param-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    padding-bottom: 4px;
  }

  .param-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .param-head {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .param-field {
    font-family: var(--mono);
    font-weight: 600;
    color: #e2e8f0;
  }

  .param-type-badge {
    font-family: var(--mono);
    font-size: 10px;
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.06);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .param-req-badge {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 1px 4px;
    border-radius: 3px;
  }

  .param-req-badge.req {
    background-color: rgba(244, 63, 94, 0.15);
    color: #fb7185;
  }

  .param-req-badge.opt {
    background-color: rgba(148, 163, 184, 0.15);
    color: #94a3b8;
  }

  .param-desc-text {
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.35;
  }

  .tool-output-block {
    background-color: #050811;
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 8px 10px;
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1.45;
    color: #a5f3fc;
    max-height: 200px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .collapsed-sidebar {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 16px;
  }

  .sidebar-expand-action {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 8px 4px;
    width: 100%;
  }

  .sidebar-expand-action:hover {
    color: #fff;
  }

  .expand-arrow {
    font-size: 14px;
    color: #38bdf8;
  }

  .collapsed-title {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  /* MAIN PLAYGROUND WRAPPER */
  .main-content {
    flex: 1;
    min-width: 0;
    width: 100%;
    padding: 24px 32px 48px;
    box-sizing: border-box;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .open-sidebar-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    padding: 6px 14px;
    background-color: var(--accent-light);
    color: #818cf8;
    border: 1px solid var(--accent);
    border-radius: 8px;
  }

  .open-sidebar-pill:hover {
    background-color: var(--accent);
    color: #fff;
  }

  .container {
    display: flex;
    flex-direction: column;
    gap: 24px;
    width: 100%;
    min-width: 0;
  }

  /* HEADER */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
    min-width: 0;
  }

  .title-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    min-width: 0;
  }

  .header-content h1 {
    font-size: 28px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 4px;
  }

  .socket-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    padding: 3px 10px;
    border-radius: 12px;
    font-weight: 500;
  }

  .socket-pill.connected {
    background-color: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .socket-pill.disconnected {
    background-color: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .socket-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background-color: currentColor;
  }

  .subtitle {
    font-size: 14px;
    color: var(--text-secondary);
  }

  .server-config {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: var(--bg-secondary);
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    font-size: 13px;
  }

  .server-config input {
    background: transparent;
    border: none;
    color: #38bdf8;
    font-family: var(--mono);
    font-size: 13px;
    width: 170px;
  }

  /* CARDS */
  .card {
    background-color: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    min-width: 0;
    box-sizing: border-box;
  }

  /* MODE SELECTOR */
  .mode-header {
    margin-bottom: 12px;
  }

  .label-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .mode-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
    min-width: 0;
  }

  .mode-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background-color: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 10px;
    text-align: left;
    color: var(--text-primary);
    min-width: 0;
  }

  .mode-btn:hover {
    border-color: var(--accent);
    background-color: var(--accent-light);
  }

  .mode-btn.active {
    border-color: var(--accent);
    background-color: var(--accent-light);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .mode-icon {
    font-size: 24px;
    flex-shrink: 0;
  }

  .mode-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .mode-label {
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mode-desc {
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* INPUT GROUP */
  .input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
    min-width: 0;
  }

  .input-header {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 13px;
  }

  .input-header label {
    font-weight: 600;
    color: var(--text-secondary);
  }

  .input-header .tip {
    color: var(--text-muted);
  }

  .input-header code {
    background: var(--border);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
  }

  textarea {
    width: 100%;
    padding: 12px 14px;
    font-size: 15px;
    line-height: 1.5;
    resize: vertical;
    box-sizing: border-box;
  }

  /* SAMPLES */
  .samples {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 20px;
    min-width: 0;
  }

  .sample-label {
    font-size: 13px;
    color: var(--text-muted);
  }

  .sample-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;
  }

  .pill-btn {
    font-size: 12px;
    padding: 4px 10px;
    background-color: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 20px;
    color: var(--text-secondary);
    white-space: normal;
    text-align: left;
  }

  .pill-btn:hover {
    color: #fff;
    border-color: var(--accent);
  }

  /* ACTIONS */
  .actions {
    display: flex;
    justify-content: flex-end;
  }

  .submit-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background-color: var(--accent);
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    padding: 12px 28px;
    border-radius: 8px;
  }

  .submit-btn:hover:not(:disabled) {
    background-color: var(--accent-hover);
    transform: translateY(-1px);
  }

  .submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner-small {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* RESULTS GRID - STRICT MIN-WIDTH TO PREVENT OVERFLOW */
  .results-section {
    width: 100%;
    min-width: 0;
  }

  .results-grid {
    display: grid;
    gap: 20px;
    width: 100%;
    min-width: 0;
  }

  .results-grid.multi-columns {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .results-grid.three-columns {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .results-grid.single-column {
    grid-template-columns: minmax(0, 1fr);
  }

  @media (max-width: 1400px) {
    .results-grid.multi-columns {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 1050px) {
    .results-grid.multi-columns,
    .results-grid.three-columns {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* RESULT CARD */
  .result-card {
    display: flex;
    flex-direction: column;
    min-height: 280px;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.2s;
  }

  .result-card.loading {
    border-color: var(--accent);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
    min-width: 0;
  }

  .card-title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;
  }

  .card-title h3 {
    font-size: 16px;
    font-weight: 600;
    color: #fff;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .card-icon {
    font-size: 18px;
  }

  .endpoint-badge {
    font-size: 11px;
    font-family: var(--mono);
    color: #38bdf8;
    background-color: rgba(56, 189, 248, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .duration-badge {
    font-size: 12px;
    font-family: var(--mono);
    color: var(--success);
    background: rgba(16, 185, 129, 0.1);
    padding: 3px 8px;
    border-radius: 6px;
  }

  .copy-btn {
    font-size: 12px;
    color: var(--text-secondary);
    background-color: var(--bg-input);
    border: 1px solid var(--border);
    padding: 3px 8px;
    border-radius: 6px;
  }

  .copy-btn:hover {
    color: #fff;
    border-color: var(--text-secondary);
  }

  /* CARD TABS */
  .card-tabs {
    display: flex;
    gap: 8px;
    margin: 12px 0;
    border-bottom: 1px solid var(--border);
    padding-bottom: 8px;
    min-width: 0;
  }

  .tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    padding: 5px 12px;
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
  }

  .tab-btn:hover {
    color: #fff;
    background-color: var(--accent-light);
  }

  .tab-btn.active {
    color: #fff;
    background-color: var(--accent);
  }

  .log-count {
    background-color: rgba(255, 255, 255, 0.2);
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 10px;
  }

  .live-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #22c55e;
    animation: livePulse 1s infinite alternate;
  }

  @keyframes livePulse {
    from { opacity: 0.3; }
    to { opacity: 1; }
  }

  /* CARD BODY */
  .card-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }

  .loading-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    color: var(--text-secondary);
    font-size: 13px;
    text-align: center;
    padding: 30px 10px;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }

  .pulsing-bar {
    width: 60px;
    height: 4px;
    background: var(--accent);
    border-radius: 4px;
    animation: pulse 1.2s infinite ease-in-out;
  }

  @keyframes pulse {
    0%, 100% {
      transform: scaleX(0.4);
      opacity: 0.4;
    }
    50% {
      transform: scaleX(1);
      opacity: 1;
    }
  }

  .latest-log-preview {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    color: #e2e8f0;
    background-color: var(--bg-input);
    padding: 10px 12px;
    border-radius: 6px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    text-align: left;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .preview-msg {
    overflow-wrap: anywhere;
    word-break: break-word;
    line-height: 1.4;
  }

  .error-box {
    background-color: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    padding: 14px;
    border-radius: 8px;
    font-size: 13px;
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .error-box strong {
    display: block;
    margin-bottom: 4px;
  }

  .answer-box {
    flex: 1;
    min-width: 0;
    width: 100%;
    padding-top: 6px;
  }

  .answer-text {
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-primary);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 13px;
    padding: 40px 0;
  }

  /* LOG CONSOLE - EXPANDS FULLY VERTICALLY, NO SCROLL, NO OVERFLOW */
  .log-console {
    width: 100%;
    min-width: 0;
    background-color: #0b0f19;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    font-family: var(--mono);
    font-size: 12px;
    box-sizing: border-box;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .log-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--text-muted);
    min-height: 80px;
    font-size: 12px;
    text-align: center;
  }

  .log-stream {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    min-width: 0;
  }

  .log-entry {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }

  .log-entry:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .log-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .log-time {
    color: var(--text-muted);
    font-size: 11px;
  }

  .log-badge {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .log-badge.info {
    background-color: rgba(148, 163, 184, 0.15);
    color: #94a3b8;
  }

  .log-badge.llm {
    background-color: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
  }

  .log-badge.tool_call {
    background-color: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
  }

  .log-badge.tool_result {
    background-color: rgba(16, 185, 129, 0.15);
    color: #34d399;
  }

  .log-badge.final {
    background-color: rgba(168, 85, 247, 0.15);
    color: #c084fc;
  }

  .log-badge.error {
    background-color: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }

  .log-type-tag {
    align-self: flex-start;
    font-size: 10px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 3px;
    text-transform: uppercase;
  }

  .log-type-tag.tool_call { background: #d97706; color: #fff; }
  .log-type-tag.tool_result { background: #059669; color: #fff; }
  .log-type-tag.llm { background: #0284c7; color: #fff; }
  .log-type-tag.info { background: #475569; color: #fff; }
  .log-type-tag.final { background: #7c3aed; color: #fff; }

  .log-content {
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }

  .log-msg {
    color: #e2e8f0;
    overflow-wrap: anywhere;
    word-break: break-word;
    white-space: normal;
    display: block;
    line-height: 1.5;
  }

  /* PRE FORMATTED JSON: AUTO WRAP LINES, NO HORIZONTAL SCROLL */
  .log-data {
    background-color: #030712;
    border: 1px solid #1f2937;
    border-radius: 6px;
    padding: 8px 10px;
    margin-top: 6px;
    color: #a5f3fc;
    font-size: 11px;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-all;
    overflow-wrap: anywhere;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }

  @media (max-width: 960px) {
    .app-layout {
      flex-direction: column;
    }

    .sidebar {
      position: static;
      height: auto;
      max-height: 500px;
    }

    .sidebar.open {
      width: 100%;
      max-width: 100%;
    }

    .sidebar.collapsed {
      display: none;
    }

    .main-content {
      padding: 16px;
    }
  }
</style>
