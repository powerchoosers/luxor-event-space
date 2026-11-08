/** A deliberately small query language. It cannot express SQL, joins, OR,
 * functions, casts, arbitrary relation names, or arbitrary field names. */
export type ElenaReadPermission = 'leads' | 'planner' | 'finances' | 'operations' | 'calendar'
type Field = { permission?: ElenaReadPermission }
type Resource = { permission: ElenaReadPermission[]; fields: Record<string, Field> }

const RESOURCES: Record<string, Resource> = {
  inquiries: { permission: ['leads'], fields: { id: {}, full_name: {}, status: {}, event_type: {}, target_date: {}, guest_count: {}, attendee_count: {}, rsvp_status: {}, campaign_key: {}, flow: {}, source: {}, created_at: {}, updated_at: {}, archived_at: {}, is_test: {} } },
  bookings: { permission: ['planner'], fields: { id: {}, inquiry_id: {}, client_name: {}, event_type: {}, event_date: {}, guest_count: {}, package_name: {}, status: {}, created_at: {}, contract_status: {}, contract_total: { permission: 'finances' } } },
  notes: { permission: ['leads'], fields: { id: {}, inquiry_id: {}, author: {}, content: {}, note_type: {}, created_at: {} } },
  payments: { permission: ['finances'], fields: { id: {}, booking_id: {}, invoice_id: {}, inquiry_id: {}, amount: {}, status: {}, payment_method: {}, paid_at: {}, received_date: {}, created_at: {} } },
  expenses: { permission: ['finances'], fields: { id: {}, booking_id: {}, expense_type: {}, category: {}, description: {}, vendor_name: {}, amount: {}, status: {}, incurred_on: {}, due_date: {}, created_at: {} } },
  bills: { permission: ['finances', 'operations'], fields: { id: {}, service: {}, provider: {}, amount: {}, amount_state: {}, status: {}, due_date: {}, created_at: {}, archived_at: {} } },
  tasks: { permission: ['leads', 'calendar'], fields: { id: {}, inquiry_id: {}, title: {}, description: {}, status: {}, priority: {}, due_date: {}, completed_at: {} } },
  tour_slots: { permission: ['calendar'], fields: { id: {}, slot_date: {}, start_time: {}, end_time: {}, status: {}, capacity: {}, booked_count: {}, title: {}, notes: {} } },
  inventory: { permission: ['operations'], fields: { id: {}, category: {}, name: {}, count: {}, unit: {}, status: {} } },
  cleaning_logs: { permission: ['operations'], fields: { id: {}, task_name: {}, completed: {}, completed_at: {}, notes: {} } },
  maintenance_tasks: { permission: ['operations'], fields: { id: {}, title: {}, status: {}, priority: {}, due_date: {} } },
  invoices: { permission: ['finances'], fields: { id: {}, inquiry_id: {}, client_name: {}, event_type: {}, description: {}, subtotal: {}, tax_rate: {}, total: {}, status: {}, due_date: {}, paid_at: {} } },
  vendors: { permission: ['operations'], fields: { id: {}, name: {}, vendor_type: {}, email: {}, phone: {}, created_at: {}, archived_at: {} } },
}
const TABLES: Record<string, string> = { inquiries: 'luxor_inquiries', bookings: 'luxor_bookings', notes: 'luxor_notes', payments: 'luxor_payments', expenses: 'luxor_booking_expenses', bills: 'luxor_bills', vendors: 'luxor_vendors', tasks: 'luxor_tasks', tour_slots: 'luxor_tour_slots', inventory: 'luxor_inventory', cleaning_logs: 'luxor_cleaning_logs', maintenance_tasks: 'luxor_maintenance_tasks', invoices: 'luxor_invoices' }
type Filter = { field: string; op: 'eq' | 'gte' | 'lte' | 'is_null'; value?: string | number | boolean }
export type ElenaReadRequest = { resource: string; mode: 'list' | 'count'; fields?: string[]; filters?: Filter[]; order?: { field: string; direction: 'asc' | 'desc' }; limit?: number }

export function buildElenaReadPath(raw: unknown, permissions: ReadonlySet<ElenaReadPermission>): { path: string; mode: 'list' | 'count' } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid read request.')
  const input = raw as Record<string, unknown>
  if (Object.keys(input).some((key) => !['resource', 'mode', 'fields', 'filters', 'order', 'limit'].includes(key))) throw new Error('Unsupported query option.')
  const name = typeof input.resource === 'string' ? input.resource : ''
  const resource = Object.hasOwn(RESOURCES, name) ? RESOURCES[name] : undefined
  if (!resource || !resource.permission.every((permission) => permissions.has(permission))) throw new Error('Resource is unavailable.')
  if (input.mode !== 'list' && input.mode !== 'count') throw new Error('Choose a list or count.')
  const requireField = (field: unknown) => {
    if (typeof field !== 'string' || !Object.hasOwn(resource.fields, field)) throw new Error('Field is unavailable.')
    const permission = resource.fields[field].permission
    if (permission && !permissions.has(permission)) throw new Error('Field is unavailable.')
    return field
  }
  const fields = input.mode === 'count' ? ['id'] : input.fields
  if (!Array.isArray(fields) || fields.length < 1 || fields.length > 12 || new Set(fields).size !== fields.length) throw new Error('Choose between one and twelve distinct fields.')
  const params = new URLSearchParams({ select: fields.map(requireField).join(',') })
  const filters = input.filters === undefined ? [] : input.filters
  if (!Array.isArray(filters) || filters.length > 8) throw new Error('Invalid filters.')
  for (const rawFilter of filters) {
    if (!rawFilter || typeof rawFilter !== 'object' || Array.isArray(rawFilter)) throw new Error('Invalid filter.')
    const filter = rawFilter as Record<string, unknown>
    if (Object.keys(filter).some((key) => !['field', 'op', 'value'].includes(key))) throw new Error('Invalid filter.')
    const field = requireField(filter.field)
    if (filter.op === 'is_null') { if (filter.value !== undefined) throw new Error('Invalid null filter.'); params.append(field, 'is.null'); continue }
    if (filter.op !== 'eq' && filter.op !== 'gte' && filter.op !== 'lte') throw new Error('Unsupported filter.')
    const value = filter.value
    if ((typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') || !/^[a-zA-Z0-9 @+_:.\/-]{1,128}$/.test(String(value))) throw new Error('Invalid filter value.')
    params.append(field, `${filter.op}.${String(value)}`)
  }
  if (input.order !== undefined) {
    if (!input.order || typeof input.order !== 'object' || Array.isArray(input.order)) throw new Error('Invalid order.')
    const order = input.order as Record<string, unknown>
    if (Object.keys(order).some((key) => !['field', 'direction'].includes(key)) || (order.direction !== 'asc' && order.direction !== 'desc')) throw new Error('Invalid order.')
    params.set('order', `${requireField(order.field)}.${order.direction}`)
  }
  if (input.mode === 'list') {
    const limit = input.limit === undefined ? 25 : input.limit
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Limit must be between 1 and 100.')
    params.set('limit', String(limit))
  } else if (input.limit !== undefined || input.fields !== undefined || input.order !== undefined) throw new Error('Count does not accept fields, order, or limit.')
  return { path: `${TABLES[name]}?${params}`, mode: input.mode }
}
