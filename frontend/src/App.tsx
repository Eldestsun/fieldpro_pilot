import { useEffect, useState } from 'react'

export default function App() {
  const [msg, setMsg] = useState('Loading…')

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setMsg(JSON.stringify(d)))
      .catch(e => setMsg('Error: ' + String(e)))
  }, [])

  // Optional fallback button in case the proxy isn't applied yet
  const tryDirect = async () => {
    try {
      const r = await fetch('http://localhost:4000/api/health')
      setMsg(JSON.stringify(await r.json()))
    } catch (e) {
      setMsg('Direct error: ' + String(e))
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>FieldPro Pilot</h1>
      <p>Backend health:</p>
      <pre>{msg}</pre>
      <button onClick={tryDirect} style={{ padding: 8, marginTop: 8 }}>
        Try direct (4000)
      </button>
    </div>
  )
}
