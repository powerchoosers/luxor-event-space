# Shared changed-path + workflow-only exclude rules for Luxor Workflows release scripts.

function Invoke-WorkflowGitNames {
  param([string[]]$GitArgs)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $lines = & git @GitArgs 2>&1 | ForEach-Object { "$_" } | Where-Object { $_ -and $_ -notmatch '^(warning:|error:)' }
  $ErrorActionPreference = $prev
  return $lines
}

function Get-WorkflowReleaseExcludePatterns {
  return @(
    'src/app/(portal)/portal/finances/',
    'src/components/portal/Bill',
    'src/components/portal/Books',
    'src/components/portal/Finance',
    'src/components/portal/Vendor',
    'src/components/portal/RecurringBill',
    'src/components/portal/expenses/',
    'src/components/portal/RevenueCollections',
    'src/components/portal/FinancialOverview',
    'src/components/portal/FinanceBrowse',
    'src/components/portal/FinanceMain',
    'src/components/portal/OperationsWorkspace',
    'src/components/portal/ProvidersWorkspace',
    'src/app/api/expenses/',
    'src/app/api/operations/bills/',
    'src/app/api/operations/route.ts',
    'src/app/api/portal/vendor-profile/',
    'src/lib/luxorManualBill',
    'src/lib/luxorVendor',
    'src/lib/luxorExpense',
    'src/lib/luxorBill',
    'src/lib/luxorRecurringBill',
    'src/lib/luxorProviderWebsite',
    'src/lib/luxorExpenseChart',
    'tests/luxor-bill-',
    'tests/luxor-paid-bill',
    'tests/luxor-recurring',
    'tests/luxor-provider-website',
    'tests/luxor-schedule-website',
    'tests/luxor-operations-intake',
    'tests/postgres/paid-bill',
    'tests/postgres/recurring-cost',
    'supabase/migrations/20261109174745',
    'supabase/migrations/20261109184613',
    'supabase/migrations/20261109180007',
    'supabase/migrations/20261109182207',
    'supabase/migrations/20261109182237',
    'supabase/.temp/'
  )
}

function Get-WorkflowChangedPaths {
  @(
    (Invoke-WorkflowGitNames @('diff', '--name-only'))
    (Invoke-WorkflowGitNames @('diff', '--name-only', '--cached'))
    (Invoke-WorkflowGitNames @('ls-files', '--others', '--exclude-standard'))
  ) | Sort-Object -Unique
}

function Get-WorkflowScopedPaths {
  param([string[]]$Changed = (Get-WorkflowChangedPaths))
  $exclude = Get-WorkflowReleaseExcludePatterns
  return $Changed | Where-Object {
    $path = $_
    -not ($exclude | Where-Object { $path -like "$_*" })
  }
}
