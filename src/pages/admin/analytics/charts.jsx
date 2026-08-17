// Reusable D3.js chart components for the admin Analytics page:
// BarChart, GroupedBarChart (two series), and DonutChart.

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

// Strength levels share the CLO/PO mapping color scheme.
export const LEVEL_COLORS = { 1: '#fde68a', 2: '#f59e0b', 3: '#ea580c' }

export function BarChart({ data, color = '#16a34a', valueSuffix = '', height = 260, rotateLabels = null }) {
  const ref = useRef(null)

  useEffect(() => {
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    if (!data.length) return

    const rotate = rotateLabels ?? data.length > 6
    const margin = { top: 20, right: 12, bottom: rotate ? 58 : 40, left: 44 }
    const width = Math.max(360, margin.left + data.length * 56 + margin.right)
    svg.attr('viewBox', `0 0 ${width} ${height}`)

    const x = d3
      .scaleBand()
      .domain(data.map((d) => d.label))
      .range([margin.left, width - margin.right])
      .padding(0.25)

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.value) || 1])
      .nice()
      .range([margin.top, height - margin.bottom])

    svg
      .append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5))
      .attr('font-size', 10)

    const bottom = svg
      .append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x))
      .attr('font-size', 10)
    bottom
      .selectAll('text')
      .attr('transform', rotate ? 'rotate(-35)' : null)
      .attr('text-anchor', rotate ? 'end' : 'middle')
      .attr('dx', rotate ? '-4' : 0)
      .attr('dy', rotate ? '6' : '12')

    svg
      .selectAll('rect.bar')
      .data(data)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(d.label))
      .attr('width', x.bandwidth())
      .attr('y', (d) => y(d.value))
      .attr('height', (d) => y(0) - y(d.value))
      .attr('rx', 4)
      .attr('fill', color)

    svg
      .selectAll('text.val')
      .data(data)
      .join('text')
      .attr('class', 'val')
      .attr('x', (d) => x(d.label) + x.bandwidth() / 2)
      .attr('y', (d) => y(d.value) - 5)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .attr('fill', '#334155')
      .text((d) => d.value + valueSuffix)
  }, [data, color, valueSuffix, height, rotateLabels])

  return <svg ref={ref} className="chart-svg" />
}

// Two-series grouped bars, e.g. "CLOs in program" vs "CLOs with a mapping".
export function GroupedBarChart({ data, height = 260 }) {
  const ref = useRef(null)

  useEffect(() => {
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    if (!data.length || !data[0].series.length) return

    const keys = data[0].series.map((s) => s.key)
    const colors = data[0].series.map((s) => s.color)
    const margin = { top: 20, right: 12, bottom: 48, left: 44 }
    const width = Math.max(360, margin.left + data.length * 90 + margin.right)
    svg.attr('viewBox', `0 0 ${width} ${height}`)

    const x0 = d3
      .scaleBand()
      .domain(data.map((d) => d.group))
      .range([margin.left, width - margin.right])
      .padding(0.2)

    const x1 = d3
      .scaleBand()
      .domain(keys)
      .range([0, x0.bandwidth()])
      .padding(0.1)

    const maxVal = d3.max(data.flatMap((d) => d.series.map((s) => s.value)))
    const y = d3
      .scaleLinear()
      .domain([0, maxVal || 1])
      .nice()
      .range([margin.top, height - margin.bottom])

    svg
      .append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5))
      .attr('font-size', 10)

    svg
      .append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x0))
      .attr('font-size', 10)

    svg
      .selectAll('g.group')
      .data(data)
      .join('g')
      .attr('class', 'group')
      .attr('transform', (d) => `translate(${x0(d.group)},0)`)
      .selectAll('rect.bar')
      .data((d) => d.series)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x1(d.key))
      .attr('width', x1.bandwidth())
      .attr('y', (d) => y(d.value))
      .attr('height', (d) => y(0) - y(d.value))
      .attr('rx', 3)
      .attr('fill', (d, i) => colors[i])

    svg
      .append('g')
      .selectAll('text.val')
      .data(data.flatMap((d) => d.series.map((s) => ({ d, s }))))
      .join('text')
      .attr('class', 'val')
      .attr('x', (o) => x0(o.d.group) + x1(o.s.key) + x1.bandwidth() / 2)
      .attr('y', (o) => y(o.s.value) - 4)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('font-weight', 600)
      .attr('fill', '#334155')
      .text((o) => o.s.value)
  }, [data, height])

  return <svg ref={ref} className="chart-svg" />
}

export function DonutChart({ data, size = 220, thickness = 40 }) {
  const ref = useRef(null)

  useEffect(() => {
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const total = d3.sum(data, (d) => d.value)
    if (!total) return

    const radius = size / 2
    const arc = d3.arc().innerRadius(radius - thickness).outerRadius(radius)
    const pie = d3.pie().sort(null).value((d) => d.value)

    const g = svg
      .selectAll('g.slice')
      .data(pie(data))
      .join('g')
      .attr('class', 'slice')
    g
      .append('path')
      .attr('d', arc)
      .attr('fill', (d) => d.data.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    g
      .append('text')
      .attr('transform', (d) => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', 11)
      .attr('font-weight', 700)
      .attr('fill', '#1e293b')
      .text((d) => (total ? Math.round((d.value / total) * 100) : 0) + '%')

    svg
      .append('text')
      .attr('class', 'donut-center')
      .attr('x', radius)
      .attr('y', radius - 6)
      .attr('text-anchor', 'middle')
      .attr('font-size', 24)
      .attr('font-weight', 700)
      .attr('fill', '#1e293b')
      .text(total)
    svg
      .append('text')
      .attr('class', 'donut-center-sub')
      .attr('x', radius)
      .attr('y', radius + 16)
      .attr('text-anchor', 'middle')
      .attr('font-size', 11)
      .attr('fill', '#64748b')
      .text('mapped cells')
  }, [data, size, thickness])

  return <svg ref={ref} className="donut-svg" width={size} height={size} />
}
