import { useEffect, useMemo, useState } from 'react'

type LeadStatus = 'new' | 'contacted' | 'closed'

type Lead = {
  id: string
  name: string
  phone: string
  status: LeadStatus
  created_at: string
}

type LeadsApiResponse = {
  ok: boolean
  data?: Lead[]
  error?: string
}

const API_BASE = 'https://leadflow-production-7103.up.railway.app'

const statusBadgeClasses: Record<LeadStatus, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-amber-100 text-amber-800',
  closed: 'bg-emerald-100 text-emerald-800',
}

function prettyDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

export function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>('')
  const [search, setSearch] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all')
  const [updatingIds, setUpdatingIds] = useState<Record<string, boolean>>({})

  const loadLeads = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE}/api/leads`)
      if (!response.ok) {
        throw new Error(`Failed to fetch leads: HTTP ${response.status}`)
      }

      const json = (await response.json()) as LeadsApiResponse
      if (!json.ok) {
        throw new Error(json.error ?? 'Failed to fetch leads')
      }

      setLeads(Array.isArray(json.data) ? json.data : [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error while fetching leads'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadLeads()
  }, [])

  const filteredLeads = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return leads.filter((lead) => {
      const matchesStatus = statusFilter === 'all' || lead.status === statusFilter
      const matchesSearch =
        normalizedSearch.length === 0 ||
        lead.name.toLowerCase().includes(normalizedSearch) ||
        lead.phone.toLowerCase().includes(normalizedSearch)
      return matchesStatus && matchesSearch
    })
  }, [leads, search, statusFilter])

  const handleStatusChange = async (lead: Lead, nextStatus: LeadStatus): Promise<void> => {
    if (lead.status === nextStatus) return

    setUpdatingIds((prev) => ({ ...prev, [lead.id]: true }))
    setError('')
    const previousStatus = lead.status
    setLeads((prev) => prev.map((item) => (item.id === lead.id ? { ...item, status: nextStatus } : item)))

    try {
      const response = await fetch(`${API_BASE}/api/leads/${lead.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: nextStatus }),
      })

      const json = (await response.json()) as { ok: boolean; data?: Lead; error?: string }
      if (!response.ok || !json.ok) {
        throw new Error(json.error ?? `Failed to update status: HTTP ${response.status}`)
      }

      if (json.data != null) {
        setLeads((prev) => prev.map((item) => (item.id === lead.id ? json.data! : item)))
      }
    } catch (err) {
      setLeads((prev) => prev.map((item) => (item.id === lead.id ? { ...item, status: previousStatus } : item)))
      const message = err instanceof Error ? err.message : 'Unknown error while updating status'
      setError(message)
    } finally {
      setUpdatingIds((prev) => ({ ...prev, [lead.id]: false }))
    }
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">LeadFlow CRM Dashboard</h1>
            <p className="text-sm text-slate-500">Manage leads, track status, and monitor inbound pipeline.</p>
          </div>
          <button
            onClick={() => void loadLeads()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Refresh
          </button>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or phone..."
              className="col-span-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900 focus:ring-2"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | LeadStatus)}
              className="col-span-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900 focus:ring-2"
            >
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="closed">Closed</option>
            </select>
            <div className="col-span-1 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
              Showing <span className="font-semibold">{filteredLeads.length}</span> lead(s)
            </div>
          </div>

          {error.length > 0 && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Phone</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Created date</th>
                  <th className="px-3 py-3">Change status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td className="px-3 py-6 text-sm text-slate-500" colSpan={5}>
                      Loading leads...
                    </td>
                  </tr>
                ) : filteredLeads.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-sm text-slate-500" colSpan={5}>
                      No leads found.
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50">
                      <td className="px-3 py-3 text-sm font-medium text-slate-900">{lead.name}</td>
                      <td className="px-3 py-3 text-sm text-slate-700">{lead.phone}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClasses[lead.status]}`}>
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-700">{prettyDate(lead.created_at)}</td>
                      <td className="px-3 py-3">
                        <select
                          value={lead.status}
                          disabled={Boolean(updatingIds[lead.id])}
                          onChange={(event) => void handleStatusChange(lead, event.target.value as LeadStatus)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none ring-slate-900 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="new">new</option>
                          <option value="contacted">contacted</option>
                          <option value="closed">closed</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
