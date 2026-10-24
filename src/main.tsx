import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { WebAccess } from './components/WebAccess'
import { SharedReports } from './components/SharedReports'
import { sharedReportsMode, installWebBridge } from './lib/web-bridge'
installWebBridge()
import { TooltipProvider } from './components/ui/tooltip'
import './styles.css'

document.documentElement.classList.add('dark')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={350}>
      <>{sharedReportsMode?<SharedReports/>:<WebAccess><App /></WebAccess>}</>
    </TooltipProvider>
  </StrictMode>,
)
