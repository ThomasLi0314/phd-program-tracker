import { useState } from 'react'
import {
  DEFAULT_MODEL,
  loadEnabled,
  loadKey,
  loadModel,
  saveEnabled,
  saveKey,
  saveModel,
} from '../lib/deepseek'

/** DeepSeek key/model + enable toggle for the opt-in reply-analysis feature.
 *  Settings live in localStorage (read/written directly by the lib). */
export function AiSettings() {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState(loadKey())
  const [model, setModel] = useState(loadModel())
  const [enabled, setEnabled] = useState(loadEnabled())

  const active = enabled && !!key.trim()

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-slate-700">🤖 DeepSeek reply analysis</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {active ? 'on' : 'off'}
          </span>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="text-[11px] text-indigo-600 hover:underline">
          {open ? 'hide' : 'settings'}
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">
        When on, each <b>Sync</b> reads professor <b>reply bodies</b> with DeepSeek and summarizes
        admissions per program. ⚠️ Reply bodies are sent to DeepSeek — the “headers-only, nothing
        uploaded” privacy no longer applies while this is enabled.
      </p>

      {open && (
        <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
          <label className="flex items-center gap-2 text-[12px] font-medium text-slate-700">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked)
                saveEnabled(e.target.checked)
              }}
            />
            Enable — read reply bodies &amp; summarize (sends bodies to DeepSeek)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onBlur={() => saveKey(key)}
              type="password"
              placeholder="DeepSeek API key (sk-…)"
              className="min-w-[220px] flex-1 rounded border border-slate-300 px-2 py-1 text-[12px] text-slate-700 focus:border-indigo-400 focus:outline-none"
            />
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              onBlur={() => saveModel(model)}
              placeholder={DEFAULT_MODEL}
              className="w-40 rounded border border-slate-300 px-2 py-1 text-[12px] text-slate-700 focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <p className="text-[11px] leading-snug text-slate-400">
            Key stored only in this browser, sent directly to api.deepseek.com (no server of ours).
            Get one at{' '}
            <a
              href="https://platform.deepseek.com/"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:underline"
            >
              platform.deepseek.com
            </a>
            . Note: <code>deepseek-chat</code> retires 2026/07/24 → switch to{' '}
            <code>deepseek-v4-flash</code>.
          </p>
        </div>
      )}
    </div>
  )
}
