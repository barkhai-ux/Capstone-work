import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import SharedDashboard from './components/SharedDashboard.tsx'
import { AuthProvider } from './auth'

// Tiny path-based switch: /share/<token> renders the public viewer (no auth);
// everything else renders the authenticated app.
function Root() {
  const path = window.location.pathname;
  const shareMatch = path.match(/^\/share\/([^/?#]+)/);
  if (shareMatch) {
    return <SharedDashboard token={decodeURIComponent(shareMatch[1])} />;
  }
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
