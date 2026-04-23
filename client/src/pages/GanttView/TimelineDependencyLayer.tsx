interface TimelineDependencyEdge {
  id: string
  points: [number, number, number, number]
  highlighted?: boolean
}

interface TimelineDependencyLayerProps {
  edges: TimelineDependencyEdge[]
}

export function TimelineDependencyLayer({ edges }: TimelineDependencyLayerProps) {
  if (edges.length === 0) return null

  return (
    <g aria-hidden="true">
      {edges.map((edge) => {
        const [startX, startY, endX, endY] = edge.points
        const bendX = Math.max(startX + 18, startX + (endX - startX) / 2)
        const arrowX = endX - 8
        const color = edge.highlighted ? '#f97316' : '#94a3b8'

        return (
          <g key={edge.id}>
            <path
              d={`M ${startX} ${startY} L ${bendX} ${startY} L ${bendX} ${endY} L ${arrowX} ${endY}`}
              fill="none"
              stroke={color}
              strokeWidth={edge.highlighted ? 1.8 : 1.4}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={`M ${arrowX} ${endY - 4} L ${endX} ${endY} L ${arrowX} ${endY + 4}`}
              fill="none"
              stroke={color}
              strokeWidth={edge.highlighted ? 1.8 : 1.4}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        )
      })}
    </g>
  )
}
