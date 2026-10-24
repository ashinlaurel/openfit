import { ReportsView } from './ReportsView'
import { useReports } from '@/lib/use-reports'
export function SharedReports(){
  const reports=useReports()
  return <main className="shared-reports-page"><header className="shared-reports-heading"><div><span className="eyebrow">OPENFIT · SHARED REPORTS</span><h1>Medical reports</h1><p>Results, history and original source pages.</p></div><span>Read-only access</span></header><ReportsView reports={reports} readOnly/></main>
}
