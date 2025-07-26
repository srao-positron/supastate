// Add debug endpoint to the existing function
export async function debugQuery(driver: any, projectName: string) {
  const session = driver.session()
  try {
    // Count all entities for this project
    const countResult = await session.run(`
      MATCH (e:CodeEntity)
      WHERE e.project_name = $projectName
      RETURN count(e) as total, 
             count(CASE WHEN e.workspace_id IS NOT NULL THEN 1 END) as withWorkspace,
             collect(DISTINCT e.workspace_id)[0..5] as sampleWorkspaceIds
    `, { projectName })
    
    const record = countResult.records[0]
    const total = record?.get('total')?.toNumber() || 0
    const withWorkspace = record?.get('withWorkspace')?.toNumber() || 0
    const sampleWorkspaceIds = record?.get('sampleWorkspaceIds') || []
    
    // Get a few sample entities
    const sampleResult = await session.run(`
      MATCH (e:CodeEntity)
      WHERE e.project_name = $projectName
      RETURN e.name, e.type, e.workspace_id, e.project_name
      LIMIT 5
    `, { projectName })
    
    const samples = sampleResult.records.map(r => ({
      name: r.get('e.name'),
      type: r.get('e.type'),
      workspace_id: r.get('e.workspace_id'),
      project_name: r.get('e.project_name')
    }))
    
    return {
      total,
      withWorkspace,
      sampleWorkspaceIds,
      samples
    }
  } finally {
    await session.close()
  }
}