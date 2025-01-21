export function RadialGlyphOverall(data, customColors, options = {}) {
  this.data = [];
  this.colors = customColors || null;
  this.options = {
    // Display options
    showTooltips: options.showTooltips || true,
    showLegend: options.showLegend || true,

    // Content options
    title: options.title || "",
    subtitle: options.subtitle || "",
    labels: options.labels || data.map((_, i) => `Item ${i + 1}`),
    tooltipFormatter:
      options.tooltipFormatter || ((d) => `Value: ${d.toFixed(2)}`),

    // Style options
    backgroundColor: options.backgroundColor || "#ffffff",
    titleFont: options.titleFont || "Arial",
    titleFontSize: options.titleFontSize || "20px",
    subtitleFont: options.subtitleFont || "Arial",
    subtitleFontSize: options.subtitleFontSize || "14px",
    legendFont: options.legendFont || "Arial",
    legendFontSize: options.legendFontSize || "12px",
    titleColor: options.titleColor || "#333333",
    subtitleColor: options.subtitleColor || "#666666",
    legendTextColor: options.legendTextColor || "#333333",

    // Layout options
    margin: options.margin || { top: 30, right: 150, bottom: 120, left: 80 },
    legendPosition: options.legendPosition || "right",
    titleAlignment: options.titleAlignment || "middle",
    legendWidth: options.legendWidth || 150,
    legendSpacing: options.legendSpacing || 20,
    titleSpacing: options.titleSpacing || 30,

    // Glyph options
    glyphOpacity: options.glyphOpacity || 0.8,
    glyphStrokeColor: options.glyphStrokeColor || "#ffffff",
    glyphStrokeWidth: options.glyphStrokeWidth || 1,

    // Container options
    width: options.width || 600,
    height: options.height || 400,
  };

  this.data = [...data];

  this.createSVG = () => {
    const opts = this.options;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    // Set SVG attributes
    svg.setAttribute("width", opts.width);
    svg.setAttribute("height", opts.height);
    svg.style.backgroundColor = opts.backgroundColor;

    // Calculate dimensions
    const contentWidth = opts.width - opts.margin.left - opts.margin.right;
    const contentHeight = opts.height - opts.margin.top - opts.margin.bottom;
    const legendWidth = opts.showLegend ? opts.legendWidth : 0;
    const glyphWidth =
      contentWidth - (opts.showLegend ? legendWidth + opts.legendSpacing : 0);
    const radius = Math.min(glyphWidth, contentHeight) * 0.4;

    // Create container group
    const container = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    );
    container.setAttribute(
      "transform",
      `translate(${opts.margin.left},${opts.margin.top})`
    );

    // Add title and subtitle
    if (opts.title) {
      const titleText = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      titleText.setAttribute(
        "x",
        opts.titleAlignment === "middle" ? glyphWidth / 2 : 0
      );
      titleText.setAttribute("y", -opts.margin.top / 2);
      titleText.setAttribute("text-anchor", opts.titleAlignment);
      titleText.setAttribute("font-family", opts.titleFont);
      titleText.setAttribute("font-size", opts.titleFontSize);
      titleText.setAttribute("fill", opts.titleColor);
      titleText.textContent = opts.title;
      container.appendChild(titleText);

      if (opts.subtitle) {
        const subtitleText = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text"
        );
        subtitleText.setAttribute(
          "x",
          opts.titleAlignment === "middle" ? glyphWidth / 2 : 0
        );
        subtitleText.setAttribute("y", -opts.margin.top / 2 + 25);
        subtitleText.setAttribute("text-anchor", opts.titleAlignment);
        subtitleText.setAttribute("font-family", opts.subtitleFont);
        subtitleText.setAttribute("font-size", opts.subtitleFontSize);
        subtitleText.setAttribute("fill", opts.subtitleColor);
        subtitleText.textContent = opts.subtitle;
        container.appendChild(subtitleText);
      }
    }

    // Create glyph group
    const glyphGroup = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    );
    glyphGroup.setAttribute(
      "transform",
      `translate(${glyphWidth / 2},${contentHeight / 2})`
    );

    // Calculate angles
    const angle = (2 * Math.PI) / this.data.length;

    // Setup colors
    const colors = this.colors || d3.scaleOrdinal(d3.schemeTableau10);

    // Create defs for drop shadow
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const filter = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "filter"
    );
    filter.setAttribute("id", "drop-shadow");
    filter.innerHTML = `
        <feGaussianBlur in="SourceAlpha" stdDeviation="1"/>
        <feOffset dx="1" dy="1"/>
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.3"/>
        </feComponentTransfer>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      `;
    defs.appendChild(filter);
    svg.appendChild(defs);

    // Draw glyph segments
    this.data.forEach((d, i) => {
      const startAngle = angle * (i + 0.1);
      const endAngle = angle * (i + 0.9);

      // Create arc path
      const createArcPath = (radius) => {
        const x1 = Math.cos(startAngle) * radius;
        const y1 = Math.sin(startAngle) * radius;
        const x2 = Math.cos(endAngle) * radius;
        const y2 = Math.sin(endAngle) * radius;
        const largeArcFlag = endAngle - startAngle <= Math.PI ? 0 : 1;

        return `M 0,0 L ${x1},${y1} A ${radius},${radius} 0 ${largeArcFlag},1 ${x2},${y2} Z`;
      };

      // Background arc
      const bgPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      bgPath.setAttribute("d", createArcPath(radius * 0.9));
      bgPath.setAttribute("fill", "rgba(0,0,0,0.05)");
      glyphGroup.appendChild(bgPath);

      // Data arc
      const dataPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      dataPath.setAttribute("d", createArcPath(radius * Math.sqrt(d) * 0.95));
      dataPath.setAttribute(
        "fill",
        Array.isArray(colors) ? colors[i] : colors(i)
      );
      dataPath.setAttribute("fill-opacity", opts.glyphOpacity);
      dataPath.setAttribute("stroke", opts.glyphStrokeColor);
      dataPath.setAttribute("stroke-width", opts.glyphStrokeWidth);

      // Add hover interactions
      if (opts.showTooltips) {
        dataPath.addEventListener("mouseover", (event) => {
          dataPath.setAttribute("fill-opacity", opts.glyphOpacity + 0.2);
          const tooltip =
            document.querySelector(".radial-glyph-tooltip") || createTooltip();
          tooltip.style.visibility = "visible";
          tooltip.style.left = `${event.pageX + 10}px`;
          tooltip.style.top = `${event.pageY + 10}px`;
          tooltip.innerHTML = `
              <strong>${opts.labels[i]}</strong><br>
              ${opts.tooltipFormatter(d)}
            `;
        });

        dataPath.addEventListener("mouseout", () => {
          dataPath.setAttribute("fill-opacity", opts.glyphOpacity);
          const tooltip = document.querySelector(".radial-glyph-tooltip");
          if (tooltip) tooltip.style.visibility = "hidden";
        });
      }

      glyphGroup.appendChild(dataPath);
    });

    // Add legend
    if (opts.showLegend) {
      const legendGroup = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "g"
      );
      legendGroup.setAttribute(
        "transform",
        `translate(${glyphWidth + opts.legendSpacing}, 60)`
      );

      this.data.forEach((d, i) => {
        const legendItem = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "g"
        );
        legendItem.setAttribute("transform", `translate(0, ${i * 25})`);

        // Legend color box
        const rect = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect"
        );
        rect.setAttribute("width", "15");
        rect.setAttribute("height", "15");
        rect.setAttribute(
          "fill",
          Array.isArray(colors) ? colors[i] : colors(i)
        );
        rect.setAttribute("filter", "url(#drop-shadow)");
        legendItem.appendChild(rect);

        // Legend text
        const text = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text"
        );
        text.setAttribute("x", "25");
        text.setAttribute("y", "12");
        text.setAttribute("font-family", opts.legendFont);
        text.setAttribute("font-size", opts.legendFontSize);
        text.setAttribute("fill", opts.legendTextColor);
        text.textContent = opts.labels[i];
        legendItem.appendChild(text);

        // Add hover interaction
        legendItem.addEventListener("mouseover", () => {
          const segment = glyphGroup.children[i * 2 + 1];
          segment.setAttribute("fill-opacity", opts.glyphOpacity + 0.2);
        });

        legendItem.addEventListener("mouseout", () => {
          const segment = glyphGroup.children[i * 2 + 1];
          segment.setAttribute("fill-opacity", opts.glyphOpacity);
        });

        legendGroup.appendChild(legendItem);
      });

      container.appendChild(legendGroup);
    }

    container.appendChild(glyphGroup);
    svg.appendChild(container);
    return svg;
  };

  const createTooltip = () => {
    const tooltip = document.createElement("div");
    tooltip.className = "radial-glyph-tooltip";
    Object.assign(tooltip.style, {
      position: "absolute",
      visibility: "hidden",
      backgroundColor: "rgba(255, 255, 255, 0.95)",
      padding: "8px 12px",
      border: "1px solid #ddd",
      borderRadius: "4px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      fontFamily: this.options.legendFont,
      fontSize: this.options.legendFontSize,
      zIndex: "1000",
      pointerEvents: "none",
    });
    document.body.appendChild(tooltip);
    return tooltip;
  };
}
