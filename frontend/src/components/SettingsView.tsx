// Everything that is about the app rather than about a program: the Google
// account, backups, the optional AI, and the database itself. It used to be
// five buttons in the header; here each has room to explain itself.

import type { SyncState } from '../lib/driveSync'
import type { DataIndex } from '../lib/dataLoader'
import type { RequestBundle } from '../lib/advisorRequests'
import { GoogleAccountPanel } from './GoogleAccountPanel'
import { BackupPanel } from './BackupPanel'
import { AiSettings } from './AiSettings'

export function SettingsView({
  index,
  gmail,
  drive,
  requests,
  onRequestField,
}: {
  index: DataIndex
  gmail: {
    status: 'disconnected' | 'connected'
    email: string | null
    lastSync: number | null
    syncing: boolean
    syncStatus: string | null
    error: string | null
    onConnect: (clientId: string) => void
    onDisconnect: () => void
    onSync: () => void
  }
  drive: {
    driveSync: boolean
    syncState: SyncState
    onResolveConflict: (choice: 'restore' | 'keep-local') => void
    onSetDriveSync: (on: boolean) => void
    onBackupNow: () => void
    onRestoreFromDrive: () => void
    driveStatus: string | null
    driveTime: string | null
  }
  requests: RequestBundle
  onRequestField: () => void
}) {
  return (
    <main className="h-full flex-1 overflow-y-auto bg-slate-50/40">
      <div className="mx-auto max-w-3xl space-y-3 px-5 py-4">
        <header className="mb-1">
          <h1 className="font-serif text-lg font-bold text-slate-900">Settings</h1>
          <p className="text-[12.5px] text-slate-600">
            Account, backup and the optional AI. Your data stays in this browser unless you back it up.
          </p>
        </header>

        <GoogleAccountPanel
          status={gmail.status}
          email={gmail.email}
          lastSync={gmail.lastSync}
          syncing={gmail.syncing}
          syncStatus={gmail.syncStatus}
          error={gmail.error}
          onConnect={gmail.onConnect}
          onDisconnect={gmail.onDisconnect}
          onSync={gmail.onSync}
          driveSync={drive.driveSync}
          syncState={drive.syncState}
          onResolveConflict={drive.onResolveConflict}
          onSetDriveSync={drive.onSetDriveSync}
          onBackupNow={drive.onBackupNow}
          onRestoreFromDrive={drive.onRestoreFromDrive}
          driveStatus={drive.driveStatus}
          driveTime={drive.driveTime}
        />

        <BackupPanel requests={requests} />

        <section className="rounded-md border border-slate-200 bg-white p-4">
          <h2 className="text-[14px] font-semibold text-slate-900">Reply analysis (optional)</h2>
          <p className="mt-1 mb-2 text-[12.5px] leading-relaxed text-slate-600">
            With a DeepSeek key, each Gmail sync can read professors' reply bodies and summarise the
            admissions outlook per program on the Contact → Summary tab. Off by default.
          </p>
          <AiSettings />
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4">
          <h2 className="text-[14px] font-semibold text-slate-900">Database</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
            {index.total.toLocaleString()} programs across {index.fields.length} fields · {index.meta.cycle} ·
            data {index.meta.generated_at}.
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{index.meta.note}</p>
          <button
            onClick={onRequestField}
            className="mt-2 rounded border border-slate-300 bg-white px-2.5 py-1 text-[12.5px] font-medium text-slate-700 transition-colors hover:border-indigo-400 hover:text-indigo-700"
            title="Suggest a research field to add to the database"
          >
            Request a field…
          </button>
        </section>
      </div>
    </main>
  )
}
