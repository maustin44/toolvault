import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

function SeverityChart({ summary = {} }) {
  const { critical = 0, high = 0, medium = 0, low = 0 } = summary

  if (!critical && !high && !medium && !low) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#999', fontSize: '13px' }}>
        No findings data yet
      </div>
    )
  }

  const data = {
    labels: ['Critical', 'High', 'Medium', 'Low'],
    datasets: [{
      data: [critical, high, medium, low],
      backgroundColor: ['#E24B4A', '#EF9F27', '#378ADD', '#639922'],
      borderColor: ['#A32D2D', '#854F0B', '#185FA5', '#3B6D11'],
      borderWidth: 1,
    }]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.label}: ${ctx.raw} findings`
        }
      }
    },
    cutout: '65%'
  }

  const total = critical + high + medium + low

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '0.5rem 0' }}>
      <div style={{ position: 'relative', width: '140px', height: '140px', flexShrink: 0 }}>
        <Doughnut data={data} options={options} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center', pointerEvents: 'none'
        }}>
          <div style={{ fontSize: '22px', fontWeight: '500', color: 'var(--color-text-primary)' }}>{total}</div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>total</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
        {[
          { label: 'Critical', value: critical, color: '#E24B4A' },
          { label: 'High',     value: high,     color: '#EF9F27' },
          { label: 'Medium',   value: medium,   color: '#378ADD' },
          { label: 'Low',      value: low,      color: '#639922' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: color, flexShrink: 0 }}></span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', width: '56px' }}>{label}</span>
            <div style={{ flex: 1, background: 'var(--color-background-secondary)', borderRadius: '99px', height: '5px', overflow: 'hidden' }}>
              <div style={{ width: `${total > 0 ? (value / total * 100) : 0}%`, height: '5px', background: color, borderRadius: '99px' }}></div>
            </div>
            <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--color-text-primary)', minWidth: '28px', textAlign: 'right' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SeverityChart
