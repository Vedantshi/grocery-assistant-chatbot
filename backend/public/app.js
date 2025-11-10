// Backend URL configuration (dynamic)
// Resolution order:
// 1) URL query param ?backend=<url> (or ?api=<url>) — saved to localStorage
// 2) localStorage.BACKEND_URL
// 3) window.env.BACKEND_URL (from index.html)
// 4) '' (relative to same origin)
(function resolveBackendURL(){
  try {
    const params = new URLSearchParams(window.location.search);
    const qp = params.get('backend') || params.get('api');
    const stored = localStorage.getItem('BACKEND_URL');
    let fromEnv = (window.env && window.env.BACKEND_URL) ? String(window.env.BACKEND_URL) : '';

    let chosen = qp || stored || fromEnv || '';

    // Normalize: trim, remove trailing slash
    if (typeof chosen === 'string') {
      chosen = chosen.trim();
      if (chosen.endsWith('/')) chosen = chosen.slice(0, -1);
    }

    // Persist query override
    if (qp) {
      try { localStorage.setItem('BACKEND_URL', chosen); } catch {}
    }

    // Reflect the chosen value back to window.env for easy debugging
    window.env = Object.assign({}, window.env, { BACKEND_URL: chosen });

    if (chosen) {
      console.info('[Grocerly] Using backend:', chosen);
    } else {
      console.info('[Grocerly] Using relative backend (same origin).');
    }
  } catch (e) {
    console.warn('[Grocerly] Failed to resolve BACKEND_URL:', e);
  }
})();

const BACKEND_URL = window.env?.BACKEND_URL || '';

const { useState, useEffect, useRef } = React;

// Toast helper
(function initToast() {
  const id = 'toast-container';
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
  window.showToast = function (msg, timeout = 2500) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    el.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .2s ease, transform .2s ease';
      t.style.opacity = '0';
      t.style.transform = 'translateY(8px)';
      setTimeout(() => t.remove(), 300);
    }, timeout);
  };
})();

function Products(){
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  useEffect(()=>{ (async ()=>{ try { const r = await axios.get(`${BACKEND_URL}/api/products`); setProducts(r.data||[]);} catch(e){ console.error(e);} })(); },[]);
  useEffect(()=>{
    function onKey(e){
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); inputRef.current?.focus(); }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) { setQ(''); }
    }
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  },[]);
  
  function addProductToCart(product) {
    const ev = new CustomEvent('addToShopping', { detail: { ingredients: [{ name: product.item, products: [{ price: product.price }] }] } });
    window.dispatchEvent(ev);
    window.showToast && window.showToast(`Added ${product.item}`);
  }
  
  const ql = q.toLowerCase();
  const filtered = products.filter(p => (p.item||'').toLowerCase().includes(ql) || (p.category||'').toLowerCase().includes(ql));
  return (
    <div className="card card-tall products-card">
      <header style={{flexShrink:0}}><h2 className="section-title">Products</h2></header>
      <div className="input-wrap" aria-label="Search products" style={{flexShrink:0}}>
        <svg className="input-icon" aria-hidden="true"><use href="#icon-search"/></svg>
        <input ref={inputRef} className="input" placeholder="Search name or category" value={q} onChange={e=>setQ(e.target.value)} />
        {q && (
          <button className="btn btn-ghost btn-small" aria-label="Clear search" style={{position:'absolute', right:6, top:'50%', transform:'translateY(-50%)'}} onClick={()=>setQ('')}>×</button>
        )}
      </div>
      <div className="scroll-area list-area" style={{marginTop:12}}>
        {filtered.length===0 ? <p className="subtle">No products</p> : (
          <table className="table products-table">
            <colgroup>
              <col className="col-item" />
              <col className="col-category" />
              <col className="col-unit" />
              <col className="col-calories" />
              <col className="col-price" />
              <col className="col-add" />
            </colgroup>
            <thead>
              <tr>
                <th align="left">Item</th>
                <th align="left">Category</th>
                <th align="left">Unit</th>
                <th align="right">Calories</th>
                <th className="price-col">Price</th>
                <th className="add-col"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p,i)=> (
                <tr key={i}>
                  <td>{p.item}</td>
                  <td>{p.category}</td>
                  <td>{p.unit || '-'}</td>
                  <td align="right">{Number.isFinite(p?.nutrition?.calories) ? `${Math.round(p.nutrition.calories)} kcal` : '-'}</td>
                  <td className="price-col">${(p.price||0).toFixed(2)}</td>
                  <td className="add-col">
                    <button className="btn btn-ghost btn-small" aria-label={`Add ${p.item}`} onClick={()=>addProductToCart(p)} style={{borderRadius:'50%', width:'32px', height:'32px', padding:'0', fontSize:'18px'}}>+</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Chat({onAddToList}){
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState([]);
  const [mascot, setMascot] = useState({ name: 'Sage', emoji: '🌿', tagline: '' });
  const [showQuickOptions, setShowQuickOptions] = useState(true);
  const areaRef = useRef(null);

  // Heuristic to detect yes/no questions from the bot
  function isLikelyYesNoQuestion(text) {
    if (!text) return false;
    const s = String(text).toLowerCase();
    if (!s.includes('?')) return false;
    const triggers = [
      'yes or no', '(yes/no)', 'y/n',
      'do you want', 'would you like', 'should i',
      'is that okay', 'is that ok', 'does that work',
      'proceed', 'continue', 'go ahead',
      'is this okay', 'is this ok'
    ];
    return triggers.some(t => s.includes(t));
  }

  // Hard reset: clear session and reload welcome like a fresh page
  async function resetSoft(){
    try {
      setIsLoading(true);
      setThinkingSteps([]);
      setText('');
      // Clear session so backend creates a new one
      try { localStorage.removeItem('sessionId'); } catch {}
      // Clear existing chat and show quick options again
      setMessages([]);
      setShowQuickOptions(true);
      // Fetch a fresh welcome message and mascot (same as initial load)
      try {
        const res = await axios.get(`${BACKEND_URL}/api/welcome`);
        setMascot(res.data.mascot || { name: 'Sage', emoji: '🌿', tagline: '' });
        setMessages([{ from: 'bot', text: res.data.greeting }]);
      } catch {
        setMascot({ name: 'Sage', emoji: '🌿', tagline: '' });
        setMessages([{ from: 'bot', text: "Hi! I'm Sage �, your friendly grocery helper. What occasion are you shopping for today?" }]);
      }
      // Scroll to the top of the new conversation
      setTimeout(()=>{
        if (areaRef.current) areaRef.current.scrollTop = 0;
      }, 0);
    } catch (e) {
      console.error('Reset failed:', e);
      // Fallback: at least clear the thread locally
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }

  // Quick search suggestions
  const quickOptions = [
    { label: '🍽️ Full Day Menu', query: '__DAILY_MENU_START__' },
    { label: '🥗 Meal Prep', query: '__MEAL_PREP_START__' },
    { label: '📊 Nutrition Coach', query: '__NUTRITION_START__' },
    { label: '💰 Budget Planner', query: '__BUDGET_START__' },
    { label: '⏱️ Time Saver', query: '__TIME_START__' },
    { label: '🧺 Pantry Helper', query: '__PANTRY_START__' },
    { label: '🌿 Healthy Options', query: '__HEALTHY_START__' },
      { label: '🪷 Mindful Morsels', query: '__MINDFUL_START__' },
      { label: '🪄 Did You Know?', query: '__DYK_START__' },
  ];

  useEffect(() => {
    async function fetchWelcome() {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/welcome`);
        setMessages([{ from: 'bot', text: res.data.greeting }]);
        setMascot(res.data.mascot || mascot);
      } catch {
        setMessages([{ from: 'bot', text: "Hi! I'm Sage �, your friendly grocery helper. What occasion are you shopping for today?" }]);
      }
    }
    fetchWelcome();
  }, []);

  useEffect(()=>{
    if (!areaRef.current) return;
    areaRef.current.scrollTop = areaRef.current.scrollHeight;
  }, [messages, isLoading, thinkingSteps]);

  async function send(queryText){
    const messageToSend = queryText || text.trim();
    if(!messageToSend || isLoading) return;
    
    // Hide quick options after first message
    setShowQuickOptions(false);
    
    setText('');
    setIsLoading(true);
    setThinkingSteps([]);
    const user = {from:'user', text: messageToSend}; 
    setMessages(m=>[...m,user]);
    
    // Generate dynamic thinking steps based on the query
    function generateThinkingSteps(query) {
      const lowerQuery = query.toLowerCase();
      const steps = ['🔍 Understanding your request...'];
      
      // Detect query type and add relevant steps
      if (lowerQuery.includes('budget') || lowerQuery.includes('cheap') || lowerQuery.includes('afford') || lowerQuery.includes('$') || lowerQuery.includes('price')) {
        steps.push('💰 Analyzing budget constraints...');
        steps.push('📊 Filtering cost-effective options...');
      }
      
      if (lowerQuery.includes('healthy') || lowerQuery.includes('nutrition') || lowerQuery.includes('calorie') || lowerQuery.includes('diet') || lowerQuery.includes('protein') || lowerQuery.includes('vitamin')) {
        steps.push('🥗 Evaluating nutritional profiles...');
        steps.push('📈 Calculating macro nutrients...');
      }
      
      if (lowerQuery.includes('quick') || lowerQuery.includes('fast') || lowerQuery.includes('minute') || lowerQuery.includes('time')) {
        steps.push('⏱️ Prioritizing time-efficient recipes...');
        steps.push('⚡ Finding quick preparation methods...');
      }
      
      if (lowerQuery.includes('recipe') || lowerQuery.includes('cook') || lowerQuery.includes('meal') || lowerQuery.includes('dinner') || lowerQuery.includes('lunch') || lowerQuery.includes('breakfast')) {
        steps.push('🍳 Searching recipe database...');
        steps.push('👨‍🍳 Matching ingredients to recipes...');
      }
      
      if (lowerQuery.includes('ingredient') || lowerQuery.includes('product') || lowerQuery.includes('item')) {
        steps.push('🛒 Scanning product inventory...');
        steps.push('📦 Checking availability...');
      }
      
      if (lowerQuery.includes('vegan') || lowerQuery.includes('vegetarian') || lowerQuery.includes('gluten') || lowerQuery.includes('dairy-free') || lowerQuery.includes('allergen')) {
        steps.push('� Filtering dietary restrictions...');
        steps.push('✅ Verifying ingredient compatibility...');
      }
      
      // Always add final steps
      steps.push('✨ Crafting personalized response...');
      
      return steps;
    }
    
    const steps = generateThinkingSteps(messageToSend);
    let stepIndex = 0;
    
    const stepInterval = setInterval(() => {
      if (stepIndex < steps.length) {
        setThinkingSteps(prev => [...prev, steps[stepIndex]]);
        stepIndex++;
      }
    }, 600); // Add a step every 600ms
    
    try {
      const sessionId = localStorage.getItem('sessionId');
      const res = await axios.post(`${BACKEND_URL}/api/chat`, { message: messageToSend, sessionId });
      clearInterval(stepInterval);
      if (res.data.sessionId) localStorage.setItem('sessionId', res.data.sessionId);
      // If backend returned a shopping payload, immediately add to Shopping List
      try {
        const shopping = res?.data?.shopping;
        if (shopping && Array.isArray(shopping.ingredients) && shopping.ingredients.length > 0) {
          const ev = new CustomEvent('addToShopping', { detail: { ingredients: shopping.ingredients } });
          window.dispatchEvent(ev);
          window.showToast && window.showToast(`Added ${shopping.ingredients.length} item(s)`);
        }
      } catch {}
      setMessages(m=>[...m, {from:'bot', text: res.data.reply, recipes: res.data.recipes}]);
    } catch (error) {
      clearInterval(stepInterval);
      console.error('Chat error:', error);
      setMessages(m=>[...m, {from:'bot', text: "I'm sorry, I'm having trouble responding right now. Please try again."}]);
    } finally {
      setIsLoading(false);
      setThinkingSteps([]);
    }
  }

  function handleQuickOption(query) {
    send(query);
  }

  // Minimal markdown rendering for bot text with table support, **bold**, and <br/>
  function renderBotText(text) {
    if (!text) return null;
    const raw = String(text);

    // Escape plain text to prevent HTML injection
    const escapeHtml = (s) => s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Parse markdown-like tables into HTML tables
    function convertTablesToHtml(s) {
      const lines = s.split(/\r?\n/);
      const parts = []; // { type: 'html'|'text', content: string }
      let i = 0;
      // Minimal inline markdown renderer for table cells: supports **bold** only, safely
      function renderInlineMd(cellText) {
        if (!cellText) return '';
        // Mark bold placeholders first
        const marked = String(cellText).replace(/\*\*(.+?)\*\*/g, '§§B§§$1§§/B§§');
        // Escape everything
        let esc = escapeHtml(marked);
        // Autolink bare URLs in cells
        esc = esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1<\/a>');
        // Restore bold tags safely
        esc = esc.replace(/§§B§§/g, '<strong>').replace(/§§\/B§§/g, '</strong>');
        return esc;
      }
      while (i < lines.length) {
        const line = lines[i];
        const t = line.trim();
        const looksLikeTableRow = t.startsWith('|') && t.endsWith('|') && t.includes('|');
        if (!looksLikeTableRow) {
          parts.push({ type: 'text', content: line + '\n' });
          i++;
          continue;
        }

        // Collect contiguous table block
        const block = [];
        while (i < lines.length) {
          const lt = lines[i].trim();
          if (lt.startsWith('|') && lt.includes('|')) {
            block.push(lines[i]);
            i++;
          } else {
            break;
          }
        }

        if (block.length >= 2) {
          // Parse header, optional alignment, and body
          const splitRow = (r) => r
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map(c => c.trim());

          const header = splitRow(block[0]);
          let bodyStart = 1;
          // Detect alignment row like |---|:---:|---|
          if (/^\s*\|?\s*[:\- ]+\|[\s:|\- ]+\|?\s*$/.test(block[1])) {
            bodyStart = 2;
          }

          const rows = block.slice(bodyStart).map(splitRow).filter(r => r.length > 0);

          // Build table HTML (escaped cell content with inline **bold**)
          const ths = header.map(h => `<th align="left">${renderInlineMd(h)}</th>`).join('');
          const trs = rows.map(r => {
            const cells = r.map(c => `<td>${renderInlineMd(c)}</td>`).join('');
            return `<tr>${cells}</tr>`;
          }).join('');
          const tableHtml = `\n<table class="table markdown-table" style="margin-top:6px; width:100%">\n<thead><tr>${ths}</tr></thead>\n<tbody>${trs}</tbody>\n</table>\n`;
          parts.push({ type: 'html', content: tableHtml });
        } else {
          // Not a valid table block; treat as normal text
          parts.push({ type: 'text', content: block.join('\n') + '\n' });
        }
      }
      return parts;
    }

    // Convert tables first so we don't inject <br/> inside them
    const parts = convertTablesToHtml(raw);
    const html = parts.map(p => {
      if (p.type === 'html') return p.content; // already safe-escaped per cell
      let safe = escapeHtml(p.content);
      // Autolink bare URLs
      const urlRegex = /(https?:\/\/[^\s<]+)/g;
      let withLinks = safe.replace(urlRegex, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
      // More robust bold detection: support **bold** and __bold__, including across line breaks
      const withBold = withLinks
        .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__([\s\S]+?)__/g, '<strong>$1</strong>');
      return withBold.replace(/\n/g, '<br/>');
    }).join('');

    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  }

  function renderMessage(m, i) {
    if (m.from === 'user') {
      return <div key={i} className="chat-bubble chat-user animate__animated animate__fadeInRight">{m.text}</div>;
    } else {
      const bubbleId = `msg-${i}`;
      // Show the jump link ONLY for: (a) any recipe replies, or (b) conversational replies >150 words
  const isRecipe = Array.isArray(m.recipes) && m.recipes.length > 0;
  const wordCount = typeof m.text === 'string' ? m.text.trim().split(/\s+/).filter(Boolean).length : 0;
  const isLong = isRecipe || (wordCount > 300);
      function jumpToTopOfMessage() {
        try {
          const area = areaRef.current;
          const bubble = document.getElementById(bubbleId);
          if (area && bubble) {
            // Compute position relative to the scroll container to avoid offsetParent quirks
            const areaRect = area.getBoundingClientRect();
            const bubbleRect = bubble.getBoundingClientRect();
            const top = bubbleRect.top - areaRect.top + area.scrollTop - 8;
            area.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
          }
        } catch {}
      }
      return (
        <div key={i} id={bubbleId} className="chat-bubble chat-bot animate__animated animate__fadeInLeft">
          <span style={{fontSize:'1.3em', marginRight:8}}>{mascot.emoji}</span>
          {renderBotText(m.text)}
          {m.recipes && m.recipes.map((r,ri)=> (
            <div key={ri} className="recipe">
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap: 8}}>
                {(() => {
                  // Normalize the title: strip any LLM-provided calorie suffix like "(≈350 kcal)" or "(350 kcal)"
                  const baseName = String(r.name || '')
                    .replace(/\s*\(([~≈]?\s*\d+\s*(kcal|cal|calories)\s*)\)\s*$/i, '')
                    .trim();
                  const hasTotal = Number.isFinite(r.totalCalories) && r.totalCalories > 0;
                  const totalText = hasTotal ? `${Math.round(r.totalCalories)} kcal` : null;
                  return (
                    <div style={{display:'flex', alignItems:'baseline', gap:8, minWidth:0, flex:'1 1 auto'}}>
                      <strong style={{fontSize:'1.05rem', flex:'1 1 auto', minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{baseName || r.name}</strong>
                      {totalText && (
                        <span style={{
                          fontSize:'0.85rem',
                          color:'var(--muted)',
                          background:'rgba(80,200,120,0.12)',
                          border:'1px solid rgba(80,200,120,0.35)',
                          padding:'2px 6px',
                          borderRadius:999,
                          flexShrink:0
                        }} title="Total calories (from ingredients)">{totalText}</span>
                      )}
                    </div>
                  );
                })()}
                <div style={{display:'flex', gap:8, flexShrink:0, alignItems:'center'}}>
                  <button className="btn btn-primary btn-small" style={{flexShrink:0}} onClick={()=> onAddToList(r)}>Add ingredients</button>
                  <button className="btn btn-accent btn-small" style={{marginLeft:8, flexShrink:0}} onClick={async ()=>{
                    setIsLoading(true);
                    try {
                      const sid = localStorage.getItem('sessionId');
                      const res = await axios.post(`${BACKEND_URL}/api/chat`, { message: 'more', sessionId: sid });
                      if (res.data.sessionId) localStorage.setItem('sessionId', res.data.sessionId);
                      setMessages(m=>[...m, { from:'bot', text: res.data.reply, recipes: res.data.recipes }]);
                    } catch (error) {
                      console.error('More request failed:', error);
                      setMessages(m=>[...m, {from:'bot', text: "I'm sorry, I'm having trouble getting more recipes. Please try again."}]);
                    } finally {
                      setIsLoading(false);
                    }
                  }}>More</button>
                </div>
              </div>
              <div style={{marginTop:6}}>
                <small>Ingredients:</small>
                <table className="table" style={{marginTop:4, width:'100%'}}>
                  <thead>
                    <tr>
                      <th align="left">Ingredient</th>
                      <th align="left">Unit</th>
                      <th align="right">Calories</th>
                      <th align="right">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.ingredients.map((ing,ii)=> (
                      <tr key={ii}>
                        <td>
                          {ing.name}
                          {!ing.found ? <span style={{color:'var(--danger)'}}> (not found)</span> : null}
                        </td>
                        <td>{ing.unit || '-'}</td>
                        <td align="right">{Number.isFinite(ing.calories) ? `${Math.round(ing.calories)} kcal` : '-'}</td>
                        <td align="right">{Number.isFinite(ing.price) ? `$${ing.price.toFixed(2)}` : (ing.products?.[0]?.price != null ? `$${(+ing.products[0].price).toFixed(2)}` : '-' )}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{fontWeight:600}}>Total</td>
                      <td></td>
                      <td align="right" style={{fontWeight:600}}>{Number.isFinite(r.totalCalories) ? `${Math.round(r.totalCalories)} kcal` : '-'}</td>
                      <td align="right" style={{fontWeight:600}}>{(()=>{
                        const total = Number.isFinite(r.totalPrice) ? r.totalPrice : (Array.isArray(r.ingredients) ? r.ingredients.reduce((s,ing)=> s + (Number.isFinite(ing.price) ? ing.price : (ing.products?.[0]?.price ?? 0)), 0) : 0);
                        return total > 0 ? `$${total.toFixed(2)}` : '-';
                      })()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {Array.isArray(r.steps) && r.steps.length > 0 ? (
                <div style={{marginTop:8}}>
                  <small>Steps:</small>
                  <ol style={{marginTop:4, paddingLeft:22}}>{r.steps.map((st,si)=>(<li key={si}>{st}</li>))}</ol>
                </div>
              ) : (typeof r.steps === 'string' && r.steps ? (
                <div style={{marginTop:8}}>
                  <small>Steps:</small>
                  <div style={{marginTop:4}}>{r.steps}</div>
                </div>
              ) : null)}
            </div>
          ))}
          {isLong && (
            <div style={{marginTop:8, display:'flex', justifyContent:'flex-end'}}>
              <button
                className="btn btn-ghost btn-small"
                onClick={jumpToTopOfMessage}
                title="Scroll to the beginning of this message"
                aria-label="Jump to top of message"
                style={{fontSize:'0.85em'}}
              >
                Jump to top of message ↑
              </button>
            </div>
          )}
        </div>
      );
    }
  }

  return (
    <div className="card chat-card">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center'}}>
          <span style={{fontSize:'2em',marginRight:10}}>{mascot.emoji}</span>
          <h2 className="section" style={{margin:0}}>Chat with {mascot.name}</h2>
        </div>
        <div>
          <button
            className="btn btn-danger"
            onClick={resetSoft}
            disabled={isLoading}
            aria-label="Reset chat"
            title="Reset chat"
          >
            Reset
          </button>
        </div>
      </div>
      <div className="chat-list" ref={areaRef}>
        {messages.map((m,i)=> renderMessage(m,i))}
        {isLoading && (
          <div className="chat-bubble chat-bot typing-bubble" role="status" aria-live="polite" aria-label={`${mascot.name} is thinking`}>
            <div style={{display:'flex', alignItems:'flex-start', gap:8}}>
              <span style={{fontSize:'1.3em', flexShrink:0}}>{mascot.emoji}</span>
              <div style={{flex:1}}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:8}}>
                  <span className="typing-indicator">
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                  </span>
                  <span style={{fontSize:'0.9em', color:'var(--muted)'}}>Thinking...</span>
                </div>
                {thinkingSteps.length > 0 && (
                  <div style={{fontSize:'0.85em', color:'var(--muted)', lineHeight:1.6}}>
                    {thinkingSteps.map((step, idx) => (
                      <div key={idx} className="animate__animated animate__fadeInLeft" style={{animationDuration:'0.3s'}}>
                        {step}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <div style={{marginTop:8,flexShrink:0}}>
        {/* Contextual Yes/No quick replies when bot asks a yes/no question */}
        {(() => {
          const lastBot = [...messages].reverse().find(m => m.from === 'bot');
          const showYesNo = !isLoading && lastBot && isLikelyYesNoQuestion(lastBot.text);
          if (!showYesNo) return null;
          return (
            <div className="yesno-row" style={{marginBottom:10, display:'flex', alignItems:'center', gap:10}}>
              <span style={{color:'var(--muted)', fontSize:'0.9em'}}>Quick reply:</span>
              <div style={{display:'flex', gap:8}}>
                <button className="btn btn-primary btn-small" onClick={() => send('Yes')} disabled={isLoading} aria-label="Reply Yes">Yes</button>
                <button className="btn btn-danger-outline btn-small" onClick={() => send('No')} disabled={isLoading} aria-label="Reply No">No</button>
              </div>
            </div>
          );
        })()}

        {/* Quick search options - shown above input before first user message */}
        {showQuickOptions && messages.length <= 1 && (
          <div style={{marginBottom:12}}>
            <p style={{fontSize:'0.85em', color:'var(--muted)', marginBottom:8, fontWeight:500}}>Quick suggestions:</p>
            <div style={{display:'flex', flexWrap:'wrap', gap:'8px'}}>
              {(() => {
                const special = new Set(['__MINDFUL_START__','__DYK_START__']);
                const primaryOpts = quickOptions.filter(o => !special.has(o.query));
                const specialOpts = quickOptions.filter(o => special.has(o.query));

                return (
                  <>
                    {primaryOpts.map((opt, i) => (
                      <button
                        key={`p-${i}`}
                        className={`btn btn-ghost btn-small quick-option-btn${(opt.query === '__MINDFUL_START__' || opt.query === '__DYK_START__') ? ' btn-mindful' : ''}`}
                        onClick={() => handleQuickOption(opt.query)}
                        disabled={isLoading}
                      >
                        {opt.label}
                      </button>
                    ))}

                    {specialOpts.length > 0 && (
                      <div style={{display:'flex', flexWrap:'nowrap', gap:'8px'}}>
                        {specialOpts.map((opt, i) => (
                          <button
                            key={`s-${i}`}
                            className={`btn btn-ghost btn-small quick-option-btn btn-mindful`}
                            onClick={() => handleQuickOption(opt.query)}
                            disabled={isLoading}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
        <div style={{display:'flex', gap:8, alignItems:'flex-end'}}>
          <textarea 
            className="input"
            style={{flex:1, marginBottom:0}}
            value={text} 
            onChange={e=>setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={3} 
            placeholder="Type your request..."
            disabled={isLoading}
          />
          <button 
            className="btn btn-primary" 
            style={{flexShrink:0, height:'fit-content'}}
            onClick={()=>send()} 
            disabled={isLoading || !text.trim()}
          >
            {isLoading ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Shopping(){
  const MAX_LINE_ITEMS = 100;
  // Initialize from localStorage; accept old array format as qty=1
  const [cart, setCart] = useState(()=>{
    try {
      const raw = JSON.parse(localStorage.getItem('shopping'))||[];
      const m = new Map();
      if (Array.isArray(raw)) {
        // old format or new serialized
        raw.forEach((entry)=>{
          if (entry && (entry.key || entry.name)) {
            const key = entry.key || entry.name;
            const unitPrice = typeof entry.unitPrice === 'number' ? entry.unitPrice
                              : typeof entry.price === 'number' ? entry.price : 0;
            const qty = entry.qty ? Number(entry.qty) : 1;
            const existing = m.get(key);
            if (existing) {
              existing.qty += qty;
            } else {
              m.set(key, { name: entry.name || key, unitPrice, qty });
            }
          }
        });
      }
      return m;
    } catch { return new Map(); }
  });

  // Persist on change
  useEffect(()=>{
    const arr = Array.from(cart.entries()).map(([key, item])=> ({ key, name: item.name, unitPrice: item.unitPrice, qty: item.qty }));
    localStorage.setItem('shopping', JSON.stringify(arr));
  }, [cart]);

  // Event: Add ingredients from Chat
  useEffect(() => {
    function handleAddToShopping(e) {
      const recipe = e.detail;
      if (recipe && recipe.ingredients) {
        addMany([recipe]);
        window.showToast && window.showToast('Added ingredients');
      }
    }
    window.addEventListener('addToShopping', handleAddToShopping);
    return () => window.removeEventListener('addToShopping', handleAddToShopping);
  }, []);

  function addToCart(product){
    const key = product.id ?? product.name;
    setCart(prev => {
      const next = new Map(prev);
      const found = next.get(key);
      if (found){
        found.qty += 1;
      } else {
        if (next.size >= MAX_LINE_ITEMS) { window.showToast && window.showToast('Reached 100 items'); return prev; }
        next.set(key, { name: product.name, unitPrice: +(product.price ?? product.unitPrice ?? 0), qty: 1 });
      }
      return new Map(next);
    });
  }

  const addMany = React.useCallback((recipes) => {
    setCart(prev => {
      const next = new Map(prev);
      for (const r of recipes){
        for (const ing of (r.ingredients||[])){
          const key = ing.id ?? ing.name;
          const unitPrice = +(ing.products?.[0]?.price ?? 0);
          const existing = next.get(key);
          if (existing){
            existing.qty += 1;
          } else {
            if (next.size >= MAX_LINE_ITEMS) { break; }
            next.set(key, { name: ing.name, unitPrice, qty: 1 });
          }
        }
      }
      if (next.size >= MAX_LINE_ITEMS) { window.showToast && window.showToast('Reached 100 items'); }
      return new Map(next);
    });
  }, []);

  function inc(key){ setCart(prev=>{ const n=new Map(prev); const it=n.get(key); if(it){ it.qty+=1; } return new Map(n); }); }
  function dec(key){ setCart(prev=>{ const n=new Map(prev); const it=n.get(key); if(it){ if(it.qty<=1){ n.delete(key); } else { it.qty-=1; } } return new Map(n); }); }
  function remove(key){ setCart(prev=>{ const n=new Map(prev); n.delete(key); return new Map(n); }); }
  function clearAll(){ setCart(new Map()); localStorage.removeItem('shopping'); window.showToast && window.showToast('List cleared'); }

  function exportCSV(){
    const rows = [["Name","Unit Price","Qty","Extended Price"]];
    let grand = 0;
    for (const [, item] of cart){
      const ext = +(item.unitPrice * item.qty).toFixed(2);
      grand += ext;
      rows.push([item.name, item.unitPrice.toFixed(2), item.qty, ext.toFixed(2)]);
    }
    rows.push(["","","Total", grand.toFixed(2)]);
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='grocerly_list.csv'; a.click(); URL.revokeObjectURL(url);
    window.showToast && window.showToast('CSV exported');
  }

  const itemsArray = Array.from(cart.entries());
  const total = itemsArray.reduce((acc, [,i])=> acc + (i.unitPrice * i.qty), 0);

  return (
    <div className="card card-tall shopping-card">
      <header style={{flexShrink:0}}><h2 className="section-title">Shopping List</h2></header>
      <div className="scroll list-area" id="shoppingList">
        {itemsArray.length === 0 ? (
          <div className="subtle" style={{fontStyle:'italic'}}>No items yet.</div>
        ) : (
          itemsArray.map(([key, i])=>{
            const ext = +(i.unitPrice * i.qty).toFixed(2);
            return (
              <div key={key} className="shopping-row">
                <div className="chip">
                  <div className="meta">
                    <span className="name">{i.name}</span>
                    <span className="sub">Qty: {i.qty}</span>
                  </div>
                  <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
                    <span style={{fontWeight:600, fontSize:'15px', color:'var(--text)', minWidth:'60px', textAlign:'right'}}>${ext.toFixed(2)}</span>
                    <div style={{display:'flex', gap:'4px'}}>
                      <button className="btn btn-ghost btn-small" aria-label={`decrease ${i.name}`} onClick={()=>dec(key)} style={{borderRadius:'50%', width:'28px', height:'28px', padding:'0', fontSize:'16px'}}>−</button>
                      <button className="btn btn-ghost btn-small" aria-label={`increase ${i.name}`} onClick={()=>inc(key)} style={{borderRadius:'50%', width:'28px', height:'28px', padding:'0', fontSize:'16px'}}>+</button>
                    </div>
                  </div>
                </div>
                <button className="btn btn-ghost btn-small" aria-label={`remove ${i.name}`} onClick={()=>remove(key)} style={{fontSize:'18px', padding:'4px 8px'}}>×</button>
              </div>
            )
          })
        )}
      </div>
      <div className="sl-footer" style={{marginTop:12, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap', flexShrink:0}}>
        <div className="totals" aria-live="polite">
          <span>Items: <strong id="itemsCount">{cart.size}</strong></span>
          <span style={{margin:'0 8px'}}>•</span>
          <span>Total: $<strong id="totalAmount">{total.toFixed(2)}</strong></span>
        </div>
        <div className="controls-row" style={{display:'flex', gap:8}}>
          <button id="exportCsvBtn" className="btn btn-accent-soft" onClick={exportCSV}>Export CSV</button>
          <button id="clearBtn" className="btn btn-ghost" onClick={clearAll}>Clear</button>
        </div>
      </div>
    </div>
  )
}

function App(){
  const [theme, setTheme] = useState(() => {
    return document.documentElement.getAttribute('data-theme') || 'light';
  });

  function toggleTheme() {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  }

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  function handleAddToList(recipe){
    const ev = new CustomEvent('addToShopping', { detail: recipe });
    window.dispatchEvent(ev);
  }
  return (
    <div className="container app-shell">
      <h1 className="app-title" aria-label="Grocerly - Your Food & Health Companion" style={{marginBottom: '24px'}}>
        Grocerly <span style={{fontWeight: 600}}>— Your Food & Health Companion</span>
      </h1>
      <div className="main-grid">
        <Chat onAddToList={(r)=> handleAddToList(r)} />
        <div className="sidebar-stack">
          <Products />
          <Shopping />
        </div>
      </div>
      <p className="footer-note"><small>Fresh picks, local CSVs.</small></p>
      <button 
        className="theme-toggle-fixed" 
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
