import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function testCamilleIssues() {
  try {
    // First, let's get your session cookie from the browser
    console.log('Testing GitHub issues API for Camille repo...\n')
    console.log('Please make sure you have a valid session cookie from localhost:3000')
    console.log('You can get it from browser DevTools > Application > Cookies\n')
    
    // For testing, we'll use the API directly with service role
    const response = await fetch('http://localhost:3000/api/github/srao-positron/camille/issues', {
      method: 'GET',
      headers: {
        'Cookie': process.env.TEST_SESSION_COOKIE || '' // You'll need to set this
      }
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Error response:', response.status, error)
      return
    }

    const data = await response.json()
    console.log(`Found ${data.count} issues in ${data.repository}\n`)
    
    // Show first 5 issues
    const issuesToShow = data.issues.slice(0, 5)
    issuesToShow.forEach((issue: any) => {
      console.log(`#${issue.number}: ${issue.title}`)
      console.log(`  State: ${issue.state}`)
      console.log(`  Created: ${new Date(issue.created_at).toLocaleDateString()}`)
      console.log(`  Labels: ${issue.labels.map((l: any) => l.name).join(', ') || 'None'}`)
      console.log(`  Type: ${issue.pull_request ? 'Pull Request' : 'Issue'}`)
      console.log(`  URL: ${issue.html_url}`)
      console.log('')
    })

    if (data.issues.length > 5) {
      console.log(`... and ${data.issues.length - 5} more issues`)
    }

  } catch (error) {
    console.error('Error:', error)
  }
}

testCamilleIssues()