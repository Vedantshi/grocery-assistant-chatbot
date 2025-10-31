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
  useEffect(()=>{ (async ()=>{ try { const r = await axios.get('/api/products'); setProducts(r.data||[]);} catch(e){ console.error(e);} })(); },[]);
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
          <table className="table">
            <thead><tr><th align="left">Item</th><th align="left">Category</th><th className="price-col">Price</th><th className="add-col"></th></tr></thead>
            <tbody>
              {filtered.map((p,i)=> (
                <tr key={i}>
                  <td>{p.item}</td>
                  <td>{p.category}</td>
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
  const [mascot, setMascot] = useState({ name: 'Bloom', emoji: '🌱', tagline: '' });
  const areaRef = useRef(null);

  useEffect(() => {
    async function fetchWelcome() {
      try {
        const res = await axios.get('/api/welcome');
        setMessages([{ from: 'bot', text: res.data.greeting }]);
        setMascot(res.data.mascot || mascot);
      } catch {
        setMessages([{ from: 'bot', text: "Hi! I'm Bloom 🌱, your friendly grocery helper. What occasion are you shopping for today?" }]);
      }
    }
    fetchWelcome();
  }, []);

  useEffect(()=>{
    if (!areaRef.current) return;
    areaRef.current.scrollTop = areaRef.current.scrollHeight;
  }, [messages, isLoading]);

  async function send(){
    if(!text.trim() || isLoading) return;
    const userText = text.trim();
    setText('');
    setIsLoading(true);
    const user = {from:'user', text: userText}; 
    setMessages(m=>[...m,user]);
    try {
      const sessionId = localStorage.getItem('sessionId');
      const res = await axios.post('/api/chat', { message: userText, sessionId });
      if (res.data.sessionId) localStorage.setItem('sessionId', res.data.sessionId);
      setMessages(m=>[...m, {from:'bot', text: res.data.reply, recipes: res.data.recipes}]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(m=>[...m, {from:'bot', text: "I'm sorry, I'm having trouble responding right now. Please try again."}]);
    } finally {
      setIsLoading(false);
    }
  }

  // Minimal, safe markdown rendering for bot text: supports **bold** and line breaks
  function renderBotText(text) {
    if (!text) return null;
    const escapeHtml = (s) => s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    // First escape HTML, then apply markdown replacements
    const safe = escapeHtml(String(text));
    const withBold = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const withBreaks = withBold.replace(/\n/g, '<br/>');
    return <span dangerouslySetInnerHTML={{ __html: withBreaks }} />;
  }

  function renderMessage(m, i) {
    if (m.from === 'user') {
      return <div key={i} className="chat-bubble chat-user animate__animated animate__fadeInRight">{m.text}</div>;
    } else {
      return (
        <div key={i} className="chat-bubble chat-bot animate__animated animate__fadeInLeft">
          <span style={{fontSize:'1.3em', marginRight:8}}>{mascot.emoji}</span>
          {renderBotText(m.text)}
          {m.recipes && m.recipes.map((r,ri)=> (
            <div key={ri} className="recipe">
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap: 8}}>
                <strong style={{fontSize:'1.05rem'}}>{r.name}</strong>
                <div>
                  <button className="btn btn-primary btn-small" onClick={()=> onAddToList(r)}>Add ingredients</button>
                  <button className="btn btn-accent btn-small" style={{marginLeft:8}} onClick={async ()=>{
                    setIsLoading(true);
                    try {
                      const sid = localStorage.getItem('sessionId');
                      const res = await axios.post('/api/chat', { message: 'more', sessionId: sid });
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
                <ul style={{marginTop:4, paddingLeft:18}}>
                  {r.ingredients.map((ing,ii)=>(
                    <li key={ii}>{ing.name} {ing.found ? (ing.products?.[0]?.price ? `( $${ing.products[0].price} )` : '') : <span style={{color:'var(--danger)'}}>(not found)</span>}</li>
                  ))}
                </ul>
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
        </div>
      );
    }
  }

  return (
    <div className="card chat-card">
      <div style={{display:'flex',alignItems:'center',marginBottom:8,flexShrink:0}}>
        <span style={{fontSize:'2em',marginRight:10}}>{mascot.emoji}</span>
        <h2 className="section" style={{margin:0}}>Chat with {mascot.name}</h2>
      </div>
      <div className="chat-list" ref={areaRef}>
        {messages.map((m,i)=> renderMessage(m,i))}
        {isLoading && (
          <div className="chat-bubble chat-bot typing-bubble" role="status" aria-live="polite" aria-label={`${mascot.name} is typing`}>
            <span style={{fontSize:'1.3em', marginRight:8}}>{mascot.emoji}</span>
            <span className="typing-indicator">
              <span className="typing-dot"></span>
              <span className="typing-dot"></span>
              <span className="typing-dot"></span>
            </span>
          </div>
        )}
      </div>
      <div style={{marginTop:8,flexShrink:0}}>
        <textarea 
          className="input"
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
        <div style={{marginTop:8}}>
          <button className="btn btn-primary" onClick={send} disabled={isLoading || !text.trim()}>
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
  }, [cart]);

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

  function addMany(recipes){
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
  }

  function inc(key){ setCart(prev=>{ const n=new Map(prev); const it=n.get(key); if(it){ it.qty+=1; } return new Map(n); }); }
  function dec(key){ setCart(prev=>{ const n=new Map(prev); const it=n.get(key); if(it){ it.qty=Math.max(1,it.qty-1);} return new Map(n); }); }
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
          <button id="exportCsvBtn" className="btn btn-accent" onClick={exportCSV}>Export CSV</button>
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
      <h1 className="app-title" aria-label="Grocerly">Grocerly</h1>
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
