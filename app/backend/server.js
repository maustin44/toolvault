// ============================================================
//  ToolVault — Backend Server (Entry Point)
// ============================================================
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { securityHeaders }   from './middleware/securityHeaders.js'
import { apiLimiter }        from './middleware/rateLimiter.js'
import authRoutes            from './routes/auth.js'
import githubRoutes          from './routes/github.js'
import settingsRoutes        from './routes/settings.js'
import pipelineScanRoutes    from './routes/pipelineScans.js'
import scanTriggerRoutes     from './routes/scan_trigger.js'
import findingsRouter        from './routes/findings.js'
import integrationsRouter    from './routes/integrations.js'
import reportRouter          from './routes/report.js'
import { EC2Client, DescribeInstancesCommand, DescribeSecurityGroupsCommand } from "@aws-sdk/client-ec2";

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

const ec2Client = new EC2Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});


if (!process.env.JWT_SECRET) {
  console.error('\n  ERROR: JWT_SECRET is not set in .env')
  process.exit(1)
}

const app = express()

app.use(securityHeaders)
app.disable('x-powered-by')
app.use(cors({ origin: '*', credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use('/api', apiLimiter)

// ---- API Routes ----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'ToolVault backend is running.', timestamp: new Date().toISOString() })
})
app.use('/api/auth',           authRoutes)
app.use('/api/github',         githubRoutes)
app.use('/api/settings',       settingsRoutes)
app.use('/api/pipeline-scans', pipelineScanRoutes)
app.use('/api/scan',           scanTriggerRoutes)
app.use('/api/findings',       findingsRouter)
app.use('/api/integrations',   integrationsRouter)
app.use('/api/report',         reportRouter)

app.get("/api/aws", async (req, res) => {
  try {
    // 🔹 EC2 Instances
    const instancesData = await ec2Client.send(new DescribeInstancesCommand({}));

    const instances = instancesData.Reservations.flatMap(r =>
      r.Instances.map(i => ({
        id: i.InstanceId,
        type: i.InstanceType,
        state: i.State.Name,
        publicIp: i.PublicIpAddress
      }))
    );

    // 🔹 Security Groups
    const sgData = await ec2Client.send(new DescribeSecurityGroupsCommand({}));

    const securityGroups = sgData.SecurityGroups.map(sg => ({
      id: sg.GroupId,
      name: sg.GroupName,
      inboundRules: sg.IpPermissions.map(rule => ({
        port: rule.FromPort,
        protocol: rule.IpProtocol,
        ranges: rule.IpRanges.map(r => r.CidrIp)
      }))
    }));

    res.json({ instances, securityGroups });

  } catch (error) {
    console.error("AWS error:", error);
    res.status(500).json({ error: "Failed to fetch AWS data" });
  }
});


// ---- Serve Frontend ----
app.use(express.static(join(__dirname, '../frontend/dist')))
app.get(/^(?!\/api).*$/, (req, res) => {
  res.sendFile(join(__dirname, '../frontend/dist/index.html'))
})

// ---- Error Handler ----
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err.message)
  res.status(500).json({ error: 'Internal server error.' })
})
   
const PORT = process.env.PORT || 3001
app.listen(PORT, '0.0.0.0', () => {
  console.log('  ToolVault Backend')
  console.log(`  Running on http://localhost:${PORT}`)
  console.log(`  Health check: http://localhost:${PORT}/api/health`)
  console.log('')
})
