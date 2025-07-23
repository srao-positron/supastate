/**
 * Code ingestion API - accepts raw code files for server-side processing
 */

import { createServiceClient } from '@/lib/supabase/server'
import { verifyApiKey } from '@/lib/auth/api-key'
import { NextResponse } from 'next/server'
import { z } from 'zod'

// Validation schema
const codeFileSchema = z.object({
  path: z.string(),
  content: z.string(),
  language: z.string().optional(),
  lastModified: z.string().optional(),
  metadata: z.record(z.any()).optional(),
})

const requestSchema = z.object({
  projectPath: z.string(),
  files: z.array(codeFileSchema),
})

export async function POST(request: Request) {
  console.log('[Code Ingest] Starting ingestion request')
  
  try {
    // Verify API key
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
    }
    
    const apiKey = authHeader.substring(7)
    const authResult = await verifyApiKey(apiKey)
    
    if (!authResult.authenticated) {
      console.log('[Code Ingest] Authentication failed')
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }
    
    // Determine workspace
    const workspace = authResult.teamId 
      ? `team:${authResult.teamId}`
      : `user:${authResult.userId}`
    
    console.log('[Code Ingest] Authenticated', { workspace })
    
    // Parse and validate request
    const body = await request.json()
    const validationResult = requestSchema.safeParse(body)
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validationResult.error.errors },
        { status: 400 }
      )
    }
    
    const { projectPath, files } = validationResult.data
    
    console.log('[Code Ingest] Processing request', {
      workspace,
      projectPath,
      fileCount: files.length,
    })
    
    // Insert files into queue
    const supabase = await createServiceClient()
    const queueItems = files.map(file => ({
      workspace_id: workspace,
      file_path: file.path,
      content: file.content,
      language: file.language || detectLanguage(file.path),
      metadata: {
        ...file.metadata,
        projectPath, // Store project path in metadata
        lastModified: file.lastModified,
        ingested_at: new Date().toISOString(),
      },
    }))
    
    // Insert in batches
    const batchSize = 50 // Smaller batch size for code files (larger content)
    const results = []
    
    for (let i = 0; i < queueItems.length; i += batchSize) {
      const batch = queueItems.slice(i, i + batchSize)
      
      const { data, error } = await supabase
        .from('code_queue')
        .upsert(batch, {
          onConflict: 'workspace_id,file_path',
          ignoreDuplicates: false,
        })
        .select('id, file_path, status')
      
      if (error) {
        console.error('[Code Ingest] Batch insert error', { 
          error,
          batchIndex: i / batchSize,
        })
        results.push({ 
          success: false, 
          error: error.message,
          files: batch.map(b => b.file_path),
        })
      } else {
        results.push({ 
          success: true, 
          files: data?.map(d => ({ 
            filePath: d.file_path, 
            queueId: d.id,
            status: d.status,
          })) || [],
        })
      }
    }
    
    // Calculate summary
    const totalQueued = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + (r.files?.length || 0), 0)
    
    const failed = results
      .filter(r => !r.success)
      .reduce((sum, r) => sum + (r.files?.length || 0), 0)
    
    console.log('[Code Ingest] Ingestion completed', {
      workspace,
      totalQueued,
      failed,
    })
    
    return NextResponse.json({
      success: true,
      queued: totalQueued,
      failed,
      results,
      message: 'Files queued for processing',
    })
    
  } catch (error) {
    console.error('[Code Ingest] Unexpected error', { error })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Simple language detection based on file extension
function detectLanguage(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase()
  
  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript', 
    tsx: 'typescript',
    py: 'python',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    r: 'r',
    m: 'matlab',
    sql: 'sql',
    sh: 'bash',
    yml: 'yaml',
    yaml: 'yaml',
    json: 'json',
    xml: 'xml',
    html: 'html',
    css: 'css',
    md: 'markdown',
  }
  
  return ext ? languageMap[ext] : undefined
}