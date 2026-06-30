import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Order } from '../types';

interface D3HourlySalesChartProps {
  orders: Order[];
}

interface HourlyDataPoint {
  date: Date;
  hourLabel: string;
  hourNum: number;   // 0-23
  revenue: number;
  orderCount: number;
}

export const D3HourlySalesChart: React.FC<D3HourlySalesChartProps> = ({ orders }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredData, setHoveredData] = useState<HourlyDataPoint | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);

  // 1. Compile 24-hour distribution datasets
  const chartData = useMemo(() => {
    const data: HourlyDataPoint[] = [];
    const now = new Date();
    
    // Create 24 hourly buckets going back 24 hours from the current hour
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1050); // slight offset to get clean hourly spreads
      d.setMinutes(0, 0, 0);
      
      const hours = d.getHours();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHour = hours % 12 === 0 ? 12 : hours % 12;
      const hourLabel = `${displayHour} ${ampm}`;
      
      data.push({
        date: d,
        hourLabel,
        hourNum: hours,
        revenue: 0,
        orderCount: 0,
      });
    }

    // Filter completed/paid orders with positive totals
    const paidOrders = orders.filter(
      o => (o.paymentStatus === 'PAID' || o.status === 'PAID') && o.total > 0
    );

    // Let's check if there are any orders in the past 24 hours
    const rangeStart = now.getTime() - 24 * 60 * 60 * 1000;
    const recentPaidOrders = paidOrders.filter(o => o.timestamp >= rangeStart);

    if (recentPaidOrders.length > 0) {
      // Use active recent transactions
      recentPaidOrders.forEach(o => {
        const orderTime = o.timestamp;
        // Find matching 1-hour window
        data.forEach(bucket => {
          const bStart = bucket.date.getTime();
          const bEnd = bStart + 60 * 60 * 1000;
          if (orderTime >= bStart && orderTime < bEnd) {
            bucket.revenue += o.total;
            bucket.orderCount += 1;
          }
        });
      });
      setIsSimulated(false);
    } else if (paidOrders.length > 0) {
      // Fallback 1: No transactions in last 24h, of ALL history populate their hour index
      // mapped into today for illustrative scheduling simulation
      paidOrders.forEach(o => {
        const oDate = new Date(o.timestamp);
        const oHour = oDate.getHours();
        data.forEach(bucket => {
          if (bucket.hourNum === oHour) {
            bucket.revenue += o.total;
            bucket.orderCount += 1;
          }
        });
      });
      setIsSimulated(true);
    } else {
      // Fallback 2: Generate realistic default restaurant curve based on normal operating hours
      // Lunch Rush: 12-14, Dinner Rush: 18-21, Afternoon slump: 15-16
      data.forEach(bucket => {
        const hour = bucket.hourNum;
        if (hour >= 8 && hour < 11) {
          // Breakfast
          bucket.revenue = Math.floor(120 + Math.random() * 80);
          bucket.orderCount = Math.floor(8 + Math.random() * 4);
        } else if (hour >= 11 && hour < 14) {
          // Peak Lunch Rush
          bucket.revenue = Math.floor(450 + Math.random() * 150);
          bucket.orderCount = Math.floor(25 + Math.random() * 8);
        } else if (hour >= 14 && hour < 17) {
          // Mid-Afternoon Trough
          bucket.revenue = Math.floor(60 + Math.random() * 40);
          bucket.orderCount = Math.floor(3 + Math.random() * 3);
        } else if (hour >= 17 && hour < 21) {
          // Peak Dinner Rush
          bucket.revenue = Math.floor(650 + Math.random() * 200);
          bucket.orderCount = Math.floor(35 + Math.random() * 12);
        } else if (hour >= 21 && hour <= 23) {
          // Late Night drinks/clean-up
          bucket.revenue = Math.floor(180 + Math.random() * 90);
          bucket.orderCount = Math.floor(10 + Math.random() * 6);
        } else {
          // Closed hours
          bucket.revenue = 0;
          bucket.orderCount = 0;
        }
      });
      setIsSimulated(true);
    }

    return data;
  }, [orders]);

  // 2. Compute Peak and Trough hours (among active operational hours or generally)
  const { peak, trough } = useMemo(() => {
    let peakPoint: HourlyDataPoint | null = null;
    let troughPoint: HourlyDataPoint | null = null;

    chartData.forEach(dp => {
      // Find peak
      if (!peakPoint || dp.revenue > peakPoint.revenue) {
        peakPoint = dp;
      }
      // Find trough (we want the minimum operational hour, i.e., non-zero, if possible; fallback to overall min)
      if (dp.revenue > 0) {
        if (!troughPoint || dp.revenue < troughPoint.revenue) {
          troughPoint = dp;
        }
      }
    });

    // If all are zero, or no operational trough is found, fall back to overall min
    if (!troughPoint) {
      troughPoint = d3.min(chartData, d => d.revenue) === 0 
        ? chartData[0] 
        : chartData.reduce((p, v) => (p.revenue < v.revenue ? p : v), chartData[0]);
    }

    return { peak: peakPoint as HourlyDataPoint | null, trough: troughPoint as HourlyDataPoint | null };
  }, [chartData]);

  // 3. Render D3 Elements
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svgElement = d3.select(svgRef.current);
    svgElement.selectAll('*').remove();

    const containerRect = containerRef.current.getBoundingClientRect();
    const width = Math.max(320, containerRect.width);
    const height = Math.max(260, containerRect.height);

    const margin = { top: 30, right: 40, bottom: 40, left: 55 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const svg = svgElement
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // X Scale - 24 hours
    const xScale = d3.scaleTime()
      .domain(d3.extent(chartData, d => d.date) as [Date, Date])
      .range([0, chartWidth]);

    // Y Scale - Revenue values
    const maxRevenue = d3.max(chartData, d => d.revenue) || 100;
    const yScale = d3.scaleLinear()
      .domain([0, maxRevenue * 1.15]) 
      .range([chartHeight, 0]);

    // Background horizontal grid lines
    const yGrid = d3.axisLeft(yScale)
      .tickSize(-chartWidth)
      .tickFormat(() => '')
      .ticks(5);

    svg.append('g')
      .attr('class', 'chart-grid')
      .attr('color', '#f1f5f9')
      .style('stroke-dasharray', '3 3')
      .style('opacity', 0.5)
      .call(yGrid)
      .call(g => g.select('.domain').remove());

    // X Axis Setup
    const xAxis = d3.axisBottom(xScale)
      .ticks(d3.timeHour.every(3)) // Display labels every 3 hours for readability
      .tickFormat((domainValue) => {
        const d = domainValue as Date;
        const h = d.getHours();
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 === 0 ? 12 : h % 12;
        return `${displayH}${ampm}`;
      });

    svg.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0, ${chartHeight})`)
      .style('font-family', 'Inter, sans-serif')
      .style('font-size', '8.5px')
      .style('font-weight', '700')
      .style('color', '#94a3b8')
      .call(xAxis)
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').remove());

    // Y Axis Setup
    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickFormat(d => `$${Number(d).toFixed(0)}`);

    svg.append('g')
      .attr('class', 'y-axis')
      .style('font-family', 'Inter, sans-serif')
      .style('font-size', '8.5px')
      .style('font-weight', '700')
      .style('color', '#94a3b8')
      .call(yAxis)
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line').remove());

    // Area Gradient Definition
    const defs = svgElement.append('defs');
    const gradient = defs
      .append('linearGradient')
      .attr('id', 'd3-hourly-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#3b82f6') // Blue 500
      .attr('stop-opacity', 0.4);

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#3b82f6')
      .attr('stop-opacity', 0.0);

    // Area under the graph path
    const areaGenerator = d3.area<HourlyDataPoint>()
      .x(d => xScale(d.date))
      .y0(chartHeight)
      .y1(d => yScale(d.revenue))
      .curve(d3.curveMonotoneX);

    // Dynamic line path
    const lineGenerator = d3.line<HourlyDataPoint>()
      .x(d => xScale(d.date))
      .y(d => yScale(d.revenue))
      .curve(d3.curveMonotoneX);

    // Draw the area fill
    svg.append('path')
      .datum(chartData)
      .attr('fill', 'url(#d3-hourly-gradient)')
      .attr('d', areaGenerator);

    // Draw the trend line
    const path = svg.append('path')
      .datum(chartData)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 3)
      .attr('d', lineGenerator);

    // Animation transition on entrance
    const totalLength = path.node()?.getTotalLength() || 0;
    path
      .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
      .attr('stroke-dashoffset', totalLength)
      .transition()
      .duration(1000)
      .ease(d3.easeCubicOut)
      .attr('stroke-dashoffset', 0);

    // Draw secondary blur shadow under the line path for elegant glass/neon layout
    svg.append('path')
      .datum(chartData)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 6)
      .attr('opacity', 0.15)
      .attr('filter', 'blur(4px)')
      .attr('d', lineGenerator);

    // Draw workload indicator bars at the bottom of the chart
    // Represents order density
    const maxOrderCount = d3.max(chartData, d => d.orderCount) || 1;
    const barScale = d3.scaleLinear()
      .domain([0, maxOrderCount])
      .range([0, 35]); // Height of order workload bars is max 35px at the bottom

    const barWidth = Math.max(2, (chartWidth / chartData.length) * 0.4);

    svg.append('g')
      .attr('class', 'workload-bars')
      .selectAll('.workload-bar')
      .data(chartData)
      .enter()
      .append('rect')
      .attr('class', 'workload-bar')
      .attr('x', d => xScale(d.date) - barWidth / 2)
      .attr('y', d => chartHeight - barScale(d.orderCount))
      .attr('width', barWidth)
      .attr('height', d => barScale(d.orderCount))
      .attr('fill', '#cbd5e1') // Light blueish slate
      .attr('opacity', 0.45)
      .attr('rx', 1);

    // Highlight Peak hour on the graph with a special indicator dot
    if (peak && peak.revenue > 0) {
      const peakGroup = svg.append('g').attr('class', 'peak-highlight');
      
      // Pulse background ring
      peakGroup.append('circle')
        .attr('cx', xScale(peak.date))
        .attr('cy', yScale(peak.revenue))
        .attr('r', 10)
        .attr('fill', 'none')
        .attr('stroke', '#ef4444') // red-500
        .attr('stroke-width', 1.5)
        .attr('opacity', 0.6)
        .style('animation', 'pulse 2s infinite');

      // Peak dot
      peakGroup.append('circle')
        .attr('cx', xScale(peak.date))
        .attr('cy', yScale(peak.revenue))
        .attr('r', 5)
        .attr('fill', '#ef4444')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2);

      // Label
      peakGroup.append('text')
        .attr('x', xScale(peak.date))
        .attr('y', yScale(peak.revenue) - 12)
        .attr('text-anchor', 'middle')
        .style('font-family', 'Inter, sans-serif')
        .style('font-size', '8px')
        .style('font-weight', '900')
        .style('fill', '#ef4444')
        .text('PEAK');
    }

    // Highlight Trough hour on the graph with a special indicator dot
    if (trough && trough.revenue > 0 && trough !== peak) {
      const troughGroup = svg.append('g').attr('class', 'trough-highlight');
      
      // Trough dot
      troughGroup.append('circle')
        .attr('cx', xScale(trough.date))
        .attr('cy', yScale(trough.revenue))
        .attr('r', 5)
        .attr('fill', '#8b5cf6') // purple-500 or active violet
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1.5);

      // Label
      troughGroup.append('text')
        .attr('x', xScale(trough.date))
        .attr('y', yScale(trough.revenue) + 16)
        .attr('text-anchor', 'middle')
        .style('font-family', 'Inter, sans-serif')
        .style('font-size', '8px')
        .style('font-weight', '900')
        .style('fill', '#8b5cf6')
        .text('TROUGH');
    }

    // Capture hover interaction elements
    const pointsGroup = svg.append('g').attr('class', 'points-interactive');
    pointsGroup.selectAll('.interactive-dot')
      .data(chartData)
      .enter()
      .append('circle')
      .attr('class', 'interactive-dot-draw')
      .attr('id', (d, i) => `dot-${i}`)
      .attr('cx', d => xScale(d.date))
      .attr('cy', d => yScale(d.revenue))
      .attr('r', 3)
      .attr('fill', '#ffffff')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)
      .style('opacity', 0); // show only on active scan hover

    // Sliding vertical indicator line
    const hoverLine = svg.append('line')
      .attr('class', 'hover-guide-line')
      .attr('y1', 0)
      .attr('y2', chartHeight)
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 1)
      .style('stroke-dasharray', '2 2')
      .style('opacity', 0);

    const overlayWidth = chartWidth / (chartData.length - 1 || 1);

    svg.append('g')
      .attr('class', 'interaction-overlay-grid')
      .selectAll('.interactive-rect-hour')
      .data(chartData)
      .enter()
      .append('rect')
      .attr('class', 'interactive-rect-hour')
      .attr('x', (d, i) => Math.max(0, xScale(d.date) - overlayWidth / 2))
      .attr('y', 0)
      .attr('width', overlayWidth)
      .attr('height', chartHeight)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mouseover', function (event, d) {
        setHoveredData(d);
        // Display vertical hover line
        hoverLine
          .attr('x1', xScale(d.date))
          .attr('x2', xScale(d.date))
          .style('opacity', 0.6);

        // Highlight matching dot
        svg.selectAll('.interactive-dot-draw')
          .style('opacity', 0);
        
        svg.select(`#dot-${chartData.indexOf(d)}`)
          .style('opacity', 1)
          .attr('r', 6.5)
          .attr('fill', '#3b82f6')
          .attr('stroke', '#ffffff');
      })
      .on('mousemove', function (event, d) {
        hoverLine
          .attr('x1', xScale(d.date))
          .attr('x2', xScale(d.date));
      })
      .on('mouseout', function (event, d) {
        setHoveredData(null);
        hoverLine.style('opacity', 0);
        svg.selectAll('.interactive-dot-draw')
          .style('opacity', 0)
          .attr('r', 3)
          .attr('fill', '#ffffff')
          .attr('stroke', '#3b82f6');
      });

  }, [chartData, peak, trough]);

  // 4. Set up Container Resize Observer
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver(() => {
      if (svgRef.current && containerRef.current) {
        const svgElement = d3.select(svgRef.current);
        const rect = containerRef.current.getBoundingClientRect();
        svgElement.attr('width', rect.width).attr('height', rect.height);
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // 5. Compute contextual Scheduling Advice
  const advice = useMemo(() => {
    if (!peak || peak.revenue === 0) {
      return {
        title: "Balanced Operating Period",
        text: "No major spikes or slumps detected. Baseline workforce schedule is fully optimized for standard cover ratios.",
        level: "NORMAL",
        icon: "fa-circle-check",
        color: "text-slate-500 bg-slate-50 dark:bg-slate-850 border-slate-100 dark:border-slate-800"
      };
    }

    // Analyze high priority workload peaks (defined as lunch or dinner hours)
    const php = peak.hourNum;
    let shiftLabel = "Mid-Day Shifts";
    if (php >= 11 && php <= 14) shiftLabel = "Lunch Shift Rush";
    else if (php >= 17 && php <= 21) shiftLabel = "Dinner Shift Rush";
    else if (php >= 7 && php < 11) shiftLabel = "Breakfast Services Shift";

    const peakAdvice = `Significant Peak detected during the ${shiftLabel} around ${peak.hourLabel} with a workload volume of ${peak.orderCount} tickets. Staffing demands spike heavy. RECOMMENDATION: Schedule +2 service handlers and ensure kitchen prep is locked 30 mins prior.`;

    let troughAdvice = "";
    if (trough && trough.revenue > 0) {
      const thp = trough.hourNum;
      let troughLabel = "Afternoon lull";
      if (thp >= 14 && thp <= 16) troughLabel = "Overlapping lull";
      else if (thp >= 21) troughLabel = "Late-night wind down";
      
      troughAdvice = `Minimal activity slump experienced near ${trough.hourLabel} (${troughLabel}). Workload shrinks to ${trough.orderCount} tickets. RECOMMENDATION: This presents a perfect 60-minute window to phase out overlap staff, initiate shift transitions, schedule staff meals, or assign deep sanitizing audits.`;
    } else {
      troughAdvice = "Workload reduces significantly during closed hours. Recommend minimum core skeleton support.";
    }

    return {
      title: "Smart Crew Allocation Insights",
      peakText: peakAdvice,
      troughText: troughAdvice,
      level: "ACTIVE",
      icon: "fa-user-clock",
      color: "text-blue-600 bg-blue-50/40 dark:bg-blue-950/15 border-blue-100/60 dark:border-blue-900/40"
    };
  }, [peak, trough]);

  return (
    <div className="bg-white dark:bg-slate-900 p-8 rounded-[4rem] shadow-premium border border-slate-100 dark:border-slate-800 flex flex-col h-full relative" id="d3-hourly-sales-container">
      {/* Chart Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tighter italic">
              Hourly Labor Workload Matrix
            </h3>
            {isSimulated && (
              <span className="text-[7.5px] font-black uppercase text-brand-500 bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-900 px-2 py-0.5 rounded-full tracking-wider animate-pulse">
                Baseline Model
              </span>
            )}
            {!isSimulated && (
              <span className="text-[7.5px] font-black uppercase text-emerald-500 bg-emerald-50 dark:bg-emerald-555/15 border border-emerald-100 dark:border-emerald-900 px-2 py-0.5 rounded-full tracking-wider">
                Live Telemetry
              </span>
            )}
          </div>
          <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
            24-hour temporal order volumes and revenue peaks vs valleys
          </p>
        </div>

        {/* Live scanning hover feedback or baseline overview */}
        {hoveredData ? (
          <div className="bg-slate-50 dark:bg-slate-800/80 px-4 py-1.5 rounded-2xl border border-slate-100 dark:border-slate-700/50 flex items-center gap-4 animate-in fade-in slide-in-from-top-1 duration-150 shrink-0">
            <div>
              <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Target Hour
              </p>
              <p className="text-xs font-black text-slate-950 dark:text-white">
                {hoveredData.hourLabel}
              </p>
            </div>
            <div className="h-5 w-[1px] bg-slate-200 dark:bg-slate-700" />
            <div>
              <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Sales Realized
              </p>
              <p className="text-xs font-black text-blue-600 dark:text-blue-400">
                ${hoveredData.revenue.toFixed(2)}
              </p>
            </div>
            <div className="h-5 w-[1px] bg-slate-200 dark:bg-slate-700" />
            <div>
              <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Workload Force
              </p>
              <p className="text-xs font-black text-emerald-500">
                {hoveredData.orderCount} tickets
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-slate-800/30 px-3.5 py-1.5 rounded-2xl border border-slate-100 dark:border-slate-800 shrink-0 select-none">
            <i className="fas fa-crosshairs text-brand-500 animate-pulse"></i>
            <span>Drag / Hover Canvas to inspect workload metrics</span>
          </div>
        )}
      </div>

      {/* Main Core Viewport grids: Chart + Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch flex-1">
        
        {/* Left 2 Cols: The D3 Canvas Wrapper */}
        <div className="lg:col-span-2 flex flex-col justify-between">
          <div ref={containerRef} className="w-full flex-1 min-h-[240px] flex items-center justify-center relative select-none">
            <svg ref={svgRef} className="w-full h-full overflow-visible" />
          </div>

          {/* Interactive Legend */}
          <div className="flex flex-wrap items-center justify-start gap-4 mt-2 pt-3 border-t border-slate-50 dark:border-slate-850">
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <span className="w-2.5 h-[3px] bg-blue-500 rounded" />
              Realized Sales Path ($)
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <span className="w-2 h-2 bg-slate-300 dark:bg-slate-700 rounded-sm" />
              Order Workload Density (tickets)
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
              Peak Activity Zone
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <span className="w-2 h-2 bg-violet-500 rounded-full" />
              Trough Restructuring Zone
            </span>
          </div>
        </div>

        {/* Right 1 Col: Dynamic Staff Scheduler Optimizer Insights */}
        <div className="bg-slate-50/50 dark:bg-slate-850 p-6 rounded-[2.5rem] border border-slate-105 dark:border-slate-800/80 flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-blue-550/10 text-blue-500 flex items-center justify-center">
                <i className={`fas ${advice.icon} text-sm`}></i>
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider leading-none">
                  {advice.title}
                </h4>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">
                  Automated shift tuning logic
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Peak Shift Analysis */}
              {peak && peak.revenue > 0 && (
                <div className="p-4 bg-white dark:bg-slate-900 border border-red-100 dark:border-red-950/45 rounded-2xl shadow-sm">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[8.5px] font-black uppercase tracking-widest text-red-500 bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded-full inline-block leading-none">
                      Peak Shift: {peak.hourLabel}
                    </span>
                    <span className="font-mono text-xs font-black text-slate-700 dark:text-slate-300">
                      ${peak.revenue.toFixed(0)} max
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                    {advice.peakText}
                  </p>
                </div>
              )}

              {/* Trough Shift Analysis */}
              {trough && trough.revenue > 0 && (
                <div className="p-4 bg-white dark:bg-slate-900 border border-violet-100 dark:border-violet-950/45 rounded-2xl shadow-sm">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[8.5px] font-black uppercase tracking-widest text-violet-500 bg-violet-50 dark:bg-violet-950/20 px-2 py-0.5 rounded-full inline-block leading-none">
                      Trough Shift: {trough.hourLabel}
                    </span>
                    <span className="font-mono text-xs font-black text-slate-700 dark:text-slate-300">
                      ${trough.revenue.toFixed(0)} min
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                    {advice.troughText}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-indigo-500">
            <span>Core Logic: IRSW Optimizer v2</span>
            <span className="cursor-pointer hover:underline text-slate-400 dark:text-slate-500">
              Audit Shift Rules <i className="fas fa-angle-right ml-0.5"></i>
            </span>
          </div>

        </div>

      </div>

      {/* Embed visual pulses used in D3 highlight Animations */}
      <style>{`
        @keyframes pulse {
          0% {
            transform: scale(0.9);
            opacity: 1;
          }
          100% {
            transform: scale(1.6);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};
