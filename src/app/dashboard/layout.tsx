import { Suspense } from "react"
import { NavSidebar } from "@/components/dashboard/nav-sidebar"
import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Suspense fallback={<Skeleton className="w-64 h-full" />}>
        <NavSidebar />
      </Suspense>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto ml-2.5">
        <div className="container py-6">
          {children}
        </div>
      </main>
    </div>
  )
}