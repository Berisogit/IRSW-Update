import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Order } from '../types';

interface D3RevenueTrendChartProps {
  orders: Order[];
}

interface TrendDataPoint {
  date: Date;
  dateStr: string;
  revenue: number;
}

export const D3RevenueTrendChart: React.FC<D3RevenueTrendChartProps> = ({ orders }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredData, setHoveredData] = useState<TrendDataPoint | null>(null);
  const [emptyState, setEmptyState] = useState(false);

  // Group and format daily revenue over the last 7 calendar days
  const chartData = useMemo(() => {
    const paidOrders = orders.filter(o => o.paymentStatus === 'PAID');
    
    // Generate map of the last 7 days
    const dayMap = new Map<string, { date: Date; revenue: number }>();
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const key = d.toDateString();
      dayMap.set(key, { date: d, revenue: 0 });
    }

    // Populate actual order revenues
    paidOrders.forEach(o => {
      const oDate = new Date(o.timestamp);
      oDate.setHours(0, 0, 0, 0);
      const key = oDate.toDateString();
      if (dayMap.has(key)) {
        const item = dayMap.get(key)!;
        item.revenue += o.total;
      } else {
        // If it's a paid order outside the 7-day range but we want it, we can ignore or let it be.
        // Let's keep the focus on the last 7 days to show a consistent daily trend.
      }
    });

    const data: TrendDataPoint[] = Array.from(dayMap.values()).map(item => ({
      date: item.date,
      dateStr: item.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      revenue: item.revenue,
    }));

    // If all values are 0, check if we have any other paid orders in history to base on
    const nonZero = data.some(d => d.revenue > 0);
    if (!nonZero && paidOrders.length > 0) {
      // Aggregate all known paid orders directly by date
      const allDays = new Map<string, { date: Date; revenue: number }>();
      paidOrders.forEach(o => {
        const oDate = new Date(o.timestamp);
        oDate.setHours(0, 0, 0, 0);
        const key = oDate.toDateString();
        const currentSum = allDays.get(key)?.revenue || 0;
        allDays.set(key, { date: oDate, revenue: currentSum + o.total });
      });

      const fallbackData = Array.from(allDays.values())
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(-7)
        .map(item => ({
          date: item.date,
          dateStr: item.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          revenue: item.revenue,
        }));

      if (fallbackData.length > 0) {
        return fallbackData;
      }
    }

    return data;
  }, [orders]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    // Clear previous drawing
    const svgElement = d3.select(svgRef.current);
    svgElement.selectAll('*').remove();

    // Get current container width & height
    const containerRect = containerRef.current.getBoundingClientRect();
    const width = Math.max(280, containerRect.width);
    const height = Math.max(240, containerRect.height);

    const margin = { top: 20, right: 30, bottom: 40, left: 45 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Create main selection group
    const svg = svgElement
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Scale X - Temporal Scale
    const xScale = d3.scaleTime()
      .domain(d3.extent(chartData, d => d.date) as [Date, Date])
      .range([0, chartWidth]);

    // Scale Y - Linear Scale
    const maxRevenue = d3.max(chartData, d => d.revenue) || 100;
    const yScale = d3.scaleLinear()
      .domain([0, maxRevenue * 1.15]) // Include 15% extra padding above maximum
      .range([chartHeight, 0]);

    // Draw horizontal grid lines
    const yGrid = d3.axisLeft(yScale)
      .tickSize(-chartWidth)
      .tickFormat(() => '')
      .ticks(5);

    svg.append('g')
      .attr('class', 'grid')
      .attr('color', '#f1f5f9')
      .style('stroke-dasharray', '3 3')
      .style('opacity', 0.6)
      .call(yGrid)
      .call(g => g.select('.domain').remove());

    // X-Axis drawing
    const xAxis = d3.axisBottom(xScale)
      .ticks(chartData.length)
      .tickFormat((domainValue) => {
        const d = domainValue as Date;
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      });

    svg.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0, ${chartHeight})`)
      .style('font-family', 'Inter, sans-serif')
      .style('font-size', '9px')
      .style('font-weight', '700')
      .style('color', '#94a3b8')
      .call(xAxis)
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').remove());

    // Y-Axis drawing
    const yAxis = d3.axisLeft(yScale)
      .ticks(4)
      .tickFormat(d => `$${Number(d).toFixed(0)}`);

    svg.append('g')
      .attr('class', 'y-axis')
      .style('font-family', 'Inter, sans-serif')
      .style('font-size', '9px')
      .style('font-weight', '700')
      .style('color', '#94a3b8')
      .call(yAxis)
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').remove());

    // Linear Gradient Definition
    const defs = svgElement.append('defs');
    const gradient = defs
      .append('linearGradient')
      .attr('id', 'd3-revenue-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#6366f1') // Indigo 500
      .attr('stop-opacity', 0.45);

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#6366f1')
      .attr('stop-opacity', 0.0);

    // Area Generator
    const areaGenerator = d3.area<TrendDataPoint>()
      .x(d => xScale(d.date))
      .y0(chartHeight)
      .y1(d => yScale(d.revenue))
      .curve(d3.curveMonotoneX);

    // Line Generator
    const lineGenerator = d3.line<TrendDataPoint>()
      .x(d => xScale(d.date))
      .y(d => yScale(d.revenue))
      .curve(d3.curveMonotoneX);

    // Draw Area under curve
    svg.append('path')
      .datum(chartData)
      .attr('fill', 'url(#d3-revenue-gradient)')
      .attr('d', areaGenerator);

    // Draw main Trend Line
    const path = svg.append('path')
      .datum(chartData)
      .attr('fill', 'none')
      .attr('stroke', '#6366f1')
      .attr('stroke-width', 3)
      .attr('d', lineGenerator);

    // Animated path transition
    const totalLength = path.node()?.getTotalLength() || 0;
    path
      .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
      .attr('stroke-dashoffset', totalLength)
      .transition()
      .duration(900)
      .ease(d3.easeCubicOut)
      .attr('stroke-dashoffset', 0);

    // Add glowing shadow of path
    svg.append('path')
      .datum(chartData)
      .attr('fill', 'none')
      .attr('stroke', '#6366f1')
      .attr('stroke-width', 6)
      .attr('opacity', 0.15)
      .attr('filter', 'blur(4px)')
      .attr('d', lineGenerator);

    // Interactive Hover Elements (Dots & Overlay interaction panel)
    const pointsGroup = svg.append('g').attr('class', 'points');

    pointsGroup.selectAll('.point-dot')
      .data(chartData)
      .enter()
      .append('circle')
      .attr('class', 'point-dot')
      .attr('cx', d => xScale(d.date))
      .attr('cy', d => yScale(d.revenue))
      .attr('r', 4.5)
      .attr('fill', '#ffffff')
      .attr('stroke', '#6366f1')
      .attr('stroke-width', 2.5)
      .style('cursor', 'pointer')
      .style('transition', 'r 0.15s ease');

    // Create an invisible overlay band to capture mouse events for smooth tooltips
    const overlayWidth = chartWidth / (chartData.length - 1 || 1);

    svg.append('g')
      .attr('class', 'interactive-overlays')
      .selectAll('.interactive-rect')
      .data(chartData)
      .enter()
      .append('rect')
      .attr('class', 'interactive-rect')
      .attr('x', (d, i) => Math.max(0, xScale(d.date) - overlayWidth / 2))
      .attr('y', 0)
      .attr('width', overlayWidth)
      .attr('height', chartHeight)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('mouseover', function (event, d) {
        setHoveredData(d);
        // Highlight corresponding dot
        d3.selectAll('.point-dot')
          .filter(p => (p as TrendDataPoint).dateStr === d.dateStr)
          .transition()
          .duration(100)
          .attr('r', 7.5)
          .attr('fill', '#6366f1')
          .attr('stroke', '#ffffff');
      })
      .on('mouseout', function (event, d) {
        setHoveredData(null);
        // Reset dots
        d3.selectAll('.point-dot')
          .transition()
          .duration(100)
          .attr('r', 4.5)
          .attr('fill', '#ffffff')
          .attr('stroke', '#6366f1');
      });

    // Handle initial state setup
    const nonZero = chartData.some(dp => dp.revenue > 0);
    setEmptyState(!nonZero);

  }, [chartData]);

  // Hook up resize trigger
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver(() => {
      // Re-trigger the D3 draw loop by calling again with current dimensions
      const svgElement = d3.select(svgRef.current);
      if (svgRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        svgElement.attr('width', rect.width).attr('height', rect.height);
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div className="bg-white dark:bg-slate-900 p-8 rounded-[4rem] shadow-premium border border-slate-100 dark:border-slate-800 flex flex-col justify-between h-full relative" id="d3-revenue-container">
      <div>
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tighter italic">D3 Trend Matrix</h3>
            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Live daily ledger distribution patterns</p>
          </div>
          {hoveredData ? (
            <div className="bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-slate-700/50 text-right animate-in fade-in duration-200">
              <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{hoveredData.dateStr}</p>
              <p className="text-sm font-black text-brand-600 dark:text-brand-400">${hoveredData.revenue.toFixed(2)}</p>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-slate-800/30 px-3.5 py-1 rounded-xl">
              <i className="fas fa-arrow-trend-up text-brand-500 animate-pulse"></i>
              <span>Hover points to scan</span>
            </div>
          )}
        </div>
      </div>

      <div ref={containerRef} className="w-full flex-1 min-h-[220px] mt-6 flex items-center justify-center relative">
        <svg ref={svgRef} className="w-full h-full overflow-visible" />
        
        {emptyState && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 dark:bg-slate-900/70 backdrop-blur-[1px] p-6 text-center select-none rounded-[2rem]">
            <i className="fas fa-receipt text-3xl text-slate-300 dark:text-slate-700 mb-2"></i>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Awaiting Realized Revenue</p>
            <p className="text-[8px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-wider mt-1.5 leading-normal max-w-xs">
              Settle guest transactions or order invoices in POSView to generate daily distribution logs.
            </p>
          </div>
        )}
      </div>

      <footer className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-800/60 flex justify-between items-center shrink-0">
        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Source: System Ledger Node</span>
        <div className="flex items-center gap-1.5 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
          Active Pipeline
        </div>
      </footer>
    </div>
  );
};
