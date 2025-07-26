import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function checkCodeFiles() {
  // Count code files
  const { count, error: countError } = await supabase
    .from('code_files')
    .select('*', { count: 'exact', head: true })
    
  console.log('Total code files:', count)
  
  // Get recent files
  const { data: recent, error: recentError } = await supabase
    .from('code_files')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)
    
  if (!recentError && recent) {
    console.log('\nMost recent code files:')
    console.table(recent.map(r => ({
      path: r.path,
      project: r.project_name,
      workspace: r.workspace_id,
      created: new Date(r.created_at).toLocaleString(),
      size: r.size
    })))
  }
  
  // Count by project
  const { data: projects, error: projectError } = await supabase
    .from('code_files')
    .select('project_name')
    
  if (!projectError && projects) {
    const projectCounts = projects.reduce((acc, p) => {
      acc[p.project_name] = (acc[p.project_name] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    console.log('\nFiles by project:')
    console.table(projectCounts)
  }
}

checkCodeFiles()