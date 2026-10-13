import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Search,
  Printer,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Filter,
  Building2,
  SlidersHorizontal,
  X,
  RotateCcw,
  Plus,
  Minus,
  CheckSquare,
  Square,
  Zap,
  Boxes,
  Tags,
  ClipboardCheck,
  Copy
} from 'lucide-react';
import { Product, ComputedProductAnalytics, StockReportMeta } from '../../types';
import { cleanDateOnly, formatCleanSalesPeriod } from '../../utils/fileParser';
import { getUniqueMainCodes, matchesMainCodeFilter, deriveCategoriesFromProducts, matchesCategoryFilter, getValidSelectedCategories } from '../../utils/mainCode';
import { printHtmlDocument } from '../../utils/exportEngine';
import { formatStandardStockProductsText, copyToClipboard } from '../../utils/copyUtils';
import { MultiSelectDropdown } from '../MultiSelectDropdown';
import { ActiveFilterChips } from '../ActiveFilterChips';
import { computeLinkedClassificationOptions } from '../../utils/linkedFilters';

interface AnalyticsTableProps {
  title: string;
  description?: string;
  products: Product[];
  analyticsMap: Map<string, ComputedProductAnalytics>;
  onSelectProduct: (product: Product) => void;
  onStartFloorAudit?: (
    filteredProducts: Product[],
    meta?: {
      mainCodeFilter?: string[];
      categoryFilter?: string[];
      rankRange?: string;
      filterConditions?: string;
    }
  ) => void;
  isDarkMode?: boolean;
  reportMeta?: StockReportMeta | null;
  storeName?: string;
  extraColumns?: Array<{
    key: string;
    label: string;
    render: (p: Product, calc: ComputedProductAnalytics | undefined) => React.ReactNode;
  }>;
}

export interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  isCustom?: boolean;
  category?: string;
}

const DEFAULT_COLUMN_CONFIGS: ColumnConfig[] = [
  { id: 'barcode', label: 'Barcode', visible: true, category: 'Codes' },
  { id: 'localCode', label: 'Bansal Code', visible: true, category: 'Codes' },
  { id: 'mainCode', label: 'MainCode', visible: true, category: 'Codes' },
  { id: 'name', label: 'Item Name', visible: true, category: 'Identity' },
  { id: 'category', label: 'Category', visible: true, category: 'Identity' },
  { id: 'costPrice', label: 'Cost Rate (₹)', visible: true, category: 'Pricing & Margin' },
  { id: 'mrp', label: 'MRP (₹)', visible: false, category: 'Pricing & Margin' },
  { id: 'retailPrice', label: 'Retail Rate (₹)', visible: true, category: 'Pricing & Margin' },
  { id: 'marginPct', label: 'Margin %', visible: false, category: 'Pricing & Margin' },
  { id: 'stock', label: 'Closing Stock', visible: true, category: 'Stock & Sales' },
  { id: 'salesCount', label: 'Sales Qty', visible: true, category: 'Stock & Sales' },
  { id: 'avgDailySales', label: 'Avg Daily Sale', visible: false, category: 'Stock & Sales' },
  { id: 'daysCover', label: 'Days Cover', visible: false, category: 'Stock & Sales' },
  { id: 'inventoryValue', label: 'Stock Value (₹)', visible: true, category: 'Valuation' },
  { id: 'salesValue', label: 'Sales Value (₹)', visible: false, category: 'Valuation' },
  { id: 'abcCategory', label: 'ABC Class', visible: true, category: 'Performance' },
  { id: 'movementStatus', label: 'Velocity', visible: false, category: 'Performance' },
  { id: 'stockStatus', label: 'Stock Status', visible: false, category: 'Performance' },
  { id: 'stockAgeGroup', label: 'Stock Age', visible: false, category: 'Performance' },
  { id: 'lastPurchaseDate', label: 'Last Purchase Date', visible: false, category: 'History' },
];

export const AnalyticsTable: React.FC<AnalyticsTableProps> = ({
  title,
  description,
  products,
  analyticsMap,
  onSelectProduct,
  onStartFloorAudit,
  isDarkMode,
  reportMeta,
  storeName = 'PATAN',
  extraColumns
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMainCodes, setSelectedMainCodes] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedVelocity, setSelectedVelocity] = useState<string>('all');
  const [selectedStockStatus, setSelectedStockStatus] = useState<string>('all');
  const [selectedRankRange, setSelectedRankRange] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('inventoryValue');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const handleCopy = async () => {
    if (sortedProducts.length === 0) return;

    // Collect active filter labels
    const activeFilters: string[] = [];
    if (selectedMainCodes.length > 0) {
      activeFilters.push(`MainCodes: ${selectedMainCodes.join(', ')}`);
    }
    if (selectedCategories.length > 0) {
      activeFilters.push(`Categories: ${selectedCategories.join(', ')}`);
    }
    if (selectedVelocity !== 'all') {
      activeFilters.push(`Velocity: ${selectedVelocity.toUpperCase()}`);
    }
    if (selectedStockStatus !== 'all') {
      activeFilters.push(`Stock Status: ${selectedStockStatus.toUpperCase()}`);
    }
    if (selectedRankRange !== 'all') {
      activeFilters.push(`Rank: ${selectedRankRange}`);
    }

    const cleanPeriod = reportMeta?.reportPeriodText
      ? formatCleanSalesPeriod(reportMeta.reportPeriodText)
      : 'Not Available';

    const text = formatStandardStockProductsText(sortedProducts, {
      title,
      store: storeName,
      activeFilters: activeFilters.length > 0 ? activeFilters : undefined,
      search: searchTerm.trim() || undefined,
      salesPeriod: cleanPeriod,
      analyticsMap,
    });

    const ok = await copyToClipboard(text);
    if (ok) {
      setCopyFeedback(`Copied ${sortedProducts.length} products`);
      setTimeout(() => setCopyFeedback(null), 2500);
    } else {
      setCopyFeedback('Failed to copy');
      setTimeout(() => setCopyFeedback(null), 2500);
    }
  };

  // Quick preset handlers for MainCodes
  const handleSetMainCodePreset = (preset: 'all' | 'food' | 'grocery' | 'nonfood' | 'noncore') => {
    if (preset === 'all') {
      setSelectedMainCodes([]);
    } else if (preset === 'food') {
      setSelectedMainCodes(['FOOD']);
    } else if (preset === 'grocery') {
      setSelectedMainCodes(['GROCERY']);
    } else if (preset === 'nonfood') {
      setSelectedMainCodes(['NON-FOOD']);
    } else if (preset === 'noncore') {
      setSelectedMainCodes(['NON-CORE']);
    }
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedMainCodes([]);
    setSelectedCategories([]);
    setSelectedVelocity('all');
    setSelectedStockStatus('all');
    setSelectedRankRange('all');
    setPage(1);
  };

  // Column picker modal state
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [columnSearchTerm, setColumnSearchTerm] = useState('');
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>(() => {
    try {
      const saved = localStorage.getItem('bsm_table_visible_columns_v3');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // fallback
    }
    return DEFAULT_COLUMN_CONFIGS;
  });

  // Expandable details state for mobile cards
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({});

  const toggleRowExpanded = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedRowIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Discover all custom keys present in products' rawRowData
  const allCustomKeys = useMemo(() => {
    const keysSet = new Set<string>();
    products.forEach((p) => {
      if (p.rawRowData) {
        Object.keys(p.rawRowData).forEach((k) => {
          if (
            k !== 'barcode' &&
            k !== 'name' &&
            k !== 'category' &&
            k !== 'mainCode' &&
            k !== 'mrp' &&
            k !== 'costPrice' &&
            k !== 'retailPrice' &&
            k !== 'stock' &&
            k !== 'salesCount' &&
            k !== 'localCode' &&
            k !== 'bansalCode' &&
            k !== 'supplierName'
          ) {
            keysSet.add(k);
          }
        });
      }
    });
    return Array.from(keysSet);
  }, [products]);

  // Ensure columnConfigs includes all discovered custom keys
  useEffect(() => {
    if (allCustomKeys.length === 0) return;
    setColumnConfigs((prev) => {
      const existingIds = new Set(prev.map((c) => c.id));
      const newItems: ColumnConfig[] = [];
      allCustomKeys.forEach((key) => {
        if (!existingIds.has(`custom_${key}`)) {
          newItems.push({
            id: `custom_${key}`,
            label: key,
            visible: false,
            isCustom: true,
            category: 'File Columns'
          });
        }
      });
      if (newItems.length === 0) return prev;
      return [...prev, ...newItems];
    });
  }, [allCustomKeys]);

  // Save column visibility to localStorage
  const handleToggleColumn = (colId: string) => {
    setColumnConfigs((prev) => {
      const updated = prev.map((c) => (c.id === colId ? { ...c, visible: !c.visible } : c));
      try {
        localStorage.setItem('bsm_table_visible_columns_v3', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const handleSelectAllColumns = () => {
    setColumnConfigs((prev) => {
      const updated = prev.map((c) => ({ ...c, visible: true }));
      try {
        localStorage.setItem('bsm_table_visible_columns_v3', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const handleDeselectAllColumns = () => {
    setColumnConfigs((prev) => {
      // Keep item name and barcode visible at least
      const updated = prev.map((c) => ({
        ...c,
        visible: c.id === 'name' || c.id === 'barcode'
      }));
      try {
        localStorage.setItem('bsm_table_visible_columns_v3', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const handleResetColumns = () => {
    setColumnConfigs(DEFAULT_COLUMN_CONFIGS);
    try {
      localStorage.removeItem('bsm_table_visible_columns_v3');
    } catch (e) {}
  };

  // Base predicate for search, velocity, and stock status
  const basePredicate = useMemo(() => {
    return (p: Product) => {
      const calc = analyticsMap.get(p.id);
      // Velocity filter
      if (selectedVelocity !== 'all') {
        const vel = calc?.movementStatus || 'normal';
        if (vel !== selectedVelocity) return false;
      }
      // Stock status filter
      if (selectedStockStatus !== 'all') {
        const status = calc?.stockStatus || (p.stock <= 0 ? 'out_of_stock' : p.stock <= 10 ? 'low_stock' : 'in_stock');
        if (status !== selectedStockStatus) return false;
      }
      if (!searchTerm.trim()) return true;
      const term = searchTerm.trim().toLowerCase();
      const nameMatch = p.name.toLowerCase().includes(term);
      const barcodeMatch = p.barcode ? p.barcode.toLowerCase().includes(term) : false;
      const mainCodeMatch = p.mainCode ? p.mainCode.toLowerCase().includes(term) : false;
      const localCodeMatch = p.localCode ? p.localCode.toLowerCase().includes(term) : false;
      const categoryMatch = p.category ? p.category.toLowerCase().includes(term) : false;
      let rawMatch = false;
      if (p.rawRowData) {
        rawMatch = Object.values(p.rawRowData).some((v) => String(v).toLowerCase().includes(term));
      }
      return nameMatch || barcodeMatch || mainCodeMatch || localCodeMatch || categoryMatch || rawMatch;
    };
  }, [searchTerm, selectedVelocity, selectedStockStatus, analyticsMap]);

  // Bidirectional linked options computation
  const linkedResult = useMemo(() => {
    return computeLinkedClassificationOptions(
      products,
      {
        getMainCode: (p) => p.mainCode,
        getCategory: (p) => p.category
      },
      {
        mainCodes: selectedMainCodes,
        categories: selectedCategories
      },
      basePredicate
    );
  }, [products, selectedMainCodes, selectedCategories, basePredicate]);

  const filteredProducts = linkedResult.filteredItems;
  const mainCodes = linkedResult.mainCodeOptions;
  const categories = linkedResult.categoryOptions;

  // Sorted & Rank-Ranged Products
  const sortedProducts = useMemo(() => {
    const arr = [...filteredProducts];
    arr.sort((a, b) => {
      const calcA = analyticsMap.get(a.id);
      const calcB = analyticsMap.get(b.id);

      let valA: any = 0;
      let valB: any = 0;

      if (sortField === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortField === 'sales') {
        valA = a.salesCount || 0;
        valB = b.salesCount || 0;
      } else if (sortField === 'stock') {
        valA = a.stock || 0;
        valB = b.stock || 0;
      } else if (sortField === 'retail') {
        valA = a.retailPrice || 0;
        valB = b.retailPrice || 0;
      } else if (sortField === 'cost') {
        valA = a.costPrice || 0;
        valB = b.costPrice || 0;
      } else if (sortField === 'inventoryValue') {
        valA = calcA ? calcA.inventoryValue : 0;
        valB = calcB ? calcB.inventoryValue : 0;
      } else if (sortField === 'abc') {
        valA = calcA ? calcA.abcCategory : 'C';
        valB = calcB ? calcB.abcCategory : 'C';
      } else if (sortField === 'daysCover') {
        const adsA = (a.salesCount || 0) / 30;
        valA = adsA > 0 ? a.stock / adsA : 9999;
        const adsB = (b.salesCount || 0) / 30;
        valB = adsB > 0 ? b.stock / adsB : 9999;
      } else if (sortField === 'marginPct') {
        valA = calcA ? calcA.marginPct : 0;
        valB = calcB ? calcB.marginPct : 0;
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });

    // Apply Rank Range filter (Top 1-100, 101-200, 201-500, 501-1000, 1-1000)
    if (selectedRankRange === 'top_1_100') {
      return arr.slice(0, 100);
    } else if (selectedRankRange === 'top_101_200') {
      return arr.slice(100, 200);
    } else if (selectedRankRange === 'top_201_500') {
      return arr.slice(200, 500);
    } else if (selectedRankRange === 'top_501_1000') {
      return arr.slice(500, 1000);
    } else if (selectedRankRange === 'top_1_1000') {
      return arr.slice(0, 1000);
    }

    return arr;
  }, [filteredProducts, analyticsMap, sortField, sortAsc, selectedRankRange]);

  // Paginated View
  const totalPages = Math.ceil(sortedProducts.length / pageSize) || 1;
  const currentPage = Math.min(page, totalPages);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedProducts.slice(start, start + pageSize);
  }, [sortedProducts, currentPage, pageSize]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const visibleColumns = useMemo(() => columnConfigs.filter((c) => c.visible), [columnConfigs]);

  // EXCEL EXPORT (.xlsx) CONTAINING STRICTLY ONLY VISIBLE / CUSTOMIZED COLUMNS
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const matrix: any[][] = [];

    // Title & Report Meta header
    matrix.push([title.toUpperCase()]);
    matrix.push([`Generated On: ${new Date().toLocaleString()}`]);
    matrix.push([`Total Active Records: ${sortedProducts.length}`]);
    matrix.push([]); // Blank row

    // Table Headers from Visible Columns only
    const headers = visibleColumns.map((col) => col.label);
    matrix.push(headers);

    // Data Rows
    sortedProducts.forEach((p) => {
      const calc = analyticsMap.get(p.id);
      const row = visibleColumns.map((col) => {
        const id = col.id;
        if (id === 'barcode') return String(p.barcode || '');
        if (id === 'localCode') return String(p.localCode || '');
        if (id === 'mainCode') return String(p.mainCode || '');
        if (id === 'name') return p.name || '';
        if (id === 'category') return p.category || 'General';
        if (id === 'costPrice') return p.costPrice || 0;
        if (id === 'mrp') return p.mrp || 0;
        if (id === 'retailPrice') return p.retailPrice || 0;
        if (id === 'marginPct') return calc ? Number(calc.marginPct.toFixed(1)) : 0;
        if (id === 'stock') return p.stock || 0;
        if (id === 'salesCount') return p.salesCount || 0;
        if (id === 'avgDailySales') return calc ? Number(calc.avgDailySales.toFixed(2)) : 0;
        if (id === 'daysCover') {
          const ads = (p.salesCount || 0) / 30;
          return ads > 0 ? Number((p.stock / ads).toFixed(1)) : (p.stock <= 0 ? 0 : 'N/A');
        }
        if (id === 'inventoryValue') return calc ? calc.inventoryValue : (p.stock * (p.costPrice || p.retailPrice || 0));
        if (id === 'salesValue') return calc ? calc.salesValue : (p.salesCount * (p.retailPrice || 0));
        if (id === 'abcCategory') return calc ? calc.abcCategory : 'C';
        if (id === 'movementStatus') return calc ? calc.movementStatus : 'normal';
        if (id === 'stockStatus') return calc ? calc.stockStatus : (p.stock <= 0 ? 'out_of_stock' : 'in_stock');
        if (id === 'stockAgeGroup') return calc ? calc.stockAgeGroup : '';
        if (id === 'lastPurchaseDate') return cleanDateOnly(p.lastPurchaseDate) || '';

        // Custom columns
        if (id.startsWith('custom_')) {
          const k = id.replace('custom_', '');
          return p.rawRowData && p.rawRowData[k] !== undefined ? String(p.rawRowData[k]) : '';
        }
        return '';
      });
      matrix.push(row);
    });

    // Summary Totals Row for Numeric columns
    const totalsRow: any[] = visibleColumns.map((col, idx) => {
      if (idx === 0) return 'TOTAL / SUMMARY';
      if (['costPrice', 'retailPrice', 'mrp', 'marginPct', 'daysCover', 'avgDailySales'].includes(col.id)) {
        return '';
      }
      if (['stock', 'salesCount', 'inventoryValue', 'salesValue'].includes(col.id)) {
        return sortedProducts.reduce((sum, p) => {
          const calc = analyticsMap.get(p.id);
          if (col.id === 'stock') return sum + (p.stock || 0);
          if (col.id === 'salesCount') return sum + (p.salesCount || 0);
          if (col.id === 'inventoryValue') return sum + (calc ? calc.inventoryValue : 0);
          if (col.id === 'salesValue') return sum + (calc ? calc.salesValue : 0);
          return sum;
        }, 0);
      }
      return '';
    });
    matrix.push(totalsRow);

    const ws = XLSX.utils.aoa_to_sheet(matrix);

    // Force string formatting for code columns to preserve leading zeros in Excel
    const dataStartRow = 5; // row index 5 (0-indexed) where data starts
    visibleColumns.forEach((col, colIdx) => {
      if (['barcode', 'localCode', 'mainCode'].includes(col.id) || col.id.startsWith('custom_')) {
        const colLetter = XLSX.utils.encode_col(colIdx);
        sortedProducts.forEach((_, rowIdx) => {
          const cellRef = `${colLetter}${dataStartRow + rowIdx + 1}`;
          if (ws[cellRef]) {
            ws[cellRef].t = 's'; // Force string
          }
        });
      }
    });

    // Set dynamic column widths
    ws['!cols'] = visibleColumns.map((col) => ({
      wch: Math.max(col.label.length + 4, col.id === 'name' ? 26 : 14)
    }));

    const cleanTitle = title.substring(0, 30).replace(/[:\/?*\[\]]/g, '');
    XLSX.utils.book_append_sheet(wb, ws, cleanTitle || 'Stock Report');

    const fileName = `${title.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // HTML Print Report
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const headersHtml = visibleColumns
      .map(
        (col) =>
          `<th style="background:#f1f5f9; padding:6px; border:1px solid #cbd5e1; font-size:10px; text-align:${
            ['costPrice', 'retailPrice', 'mrp', 'stock', 'salesCount', 'inventoryValue', 'daysCover', 'marginPct'].includes(col.id)
              ? 'right'
              : 'left'
          };">${col.label}</th>`
      )
      .join('');

    const rowsHtml = sortedProducts
      .slice(0, 500)
      .map((p, idx) => {
        const calc = analyticsMap.get(p.id);
        const cells = visibleColumns
          .map((col) => {
            const id = col.id;
            let val: any = '';
            let align = 'left';
            if (id === 'barcode') {
              val = p.barcode;
            } else if (id === 'localCode') {
              val = p.localCode || '—';
            } else if (id === 'mainCode') {
              val = p.mainCode || '—';
            } else if (id === 'name') {
              val = `<strong>${p.name}</strong>`;
            } else if (id === 'category') {
              val = p.category || 'General';
            } else if (id === 'costPrice') {
              val = p.costPrice ? `₹${p.costPrice.toLocaleString('en-IN')}` : '—';
              align = 'right';
            } else if (id === 'retailPrice') {
              val = `₹${(p.retailPrice || 0).toLocaleString('en-IN')}`;
              align = 'right';
            } else if (id === 'mrp') {
              val = `₹${(p.mrp || 0).toLocaleString('en-IN')}`;
              align = 'right';
            } else if (id === 'marginPct') {
              val = calc ? `${calc.marginPct.toFixed(1)}%` : '—';
              align = 'right';
            } else if (id === 'stock') {
              val = (p.stock || 0).toLocaleString('en-IN');
              align = 'right';
            } else if (id === 'salesCount') {
              val = (p.salesCount || 0).toLocaleString('en-IN');
              align = 'right';
            } else if (id === 'avgDailySales') {
              val = calc ? calc.avgDailySales.toFixed(2) : '—';
              align = 'right';
            } else if (id === 'daysCover') {
              const ads = (p.salesCount || 0) / 30;
              val = ads > 0 ? `${(p.stock / ads).toFixed(1)}d` : (p.stock <= 0 ? '0d' : '—');
              align = 'right';
            } else if (id === 'inventoryValue') {
              val = `₹${(calc ? calc.inventoryValue : 0).toLocaleString('en-IN')}`;
              align = 'right';
            } else if (id === 'salesValue') {
              val = `₹${(calc ? calc.salesValue : 0).toLocaleString('en-IN')}`;
              align = 'right';
            } else if (id === 'abcCategory') {
              val = calc ? calc.abcCategory : 'C';
              align = 'center';
            } else if (id === 'movementStatus') {
              val = calc ? calc.movementStatus : 'normal';
              align = 'center';
            } else if (id === 'stockStatus') {
              val = calc ? calc.stockStatus : 'in_stock';
            } else if (id === 'stockAgeGroup') {
              val = calc ? calc.stockAgeGroup : '';
            } else if (id === 'lastPurchaseDate') {
              val = cleanDateOnly(p.lastPurchaseDate) || '';
            } else if (id.startsWith('custom_')) {
              const k = id.replace('custom_', '');
              val = p.rawRowData && p.rawRowData[k] !== undefined ? String(p.rawRowData[k]) : '—';
            }

            return `<td style="padding:4px 6px; border:1px solid #e2e8f0; font-size:10px; text-align:${align};">${val}</td>`;
          })
          .join('');

        return `<tr><td style="padding:4px; border:1px solid #e2e8f0; text-align:center; font-size:9px;">${idx + 1}</td>${cells}</tr>`;
      })
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title} - Report</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 15px; color: #0f172a; margin: 0; }
            h1 { font-size: 18px; margin: 0 0 4px 0; font-weight: 800; }
            p { font-size: 11px; color: #64748b; margin: 0 0 12px 0; }
            table { width: 100%; border-collapse: collapse; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>${title.toUpperCase()}</h1>
          <p>Generated: ${new Date().toLocaleString()} | Active Records: ${sortedProducts.length} (Showing first 500)</p>
          <table>
            <thead>
              <tr>
                <th style="width:25px; background:#f1f5f9; padding:6px; border:1px solid #cbd5e1; font-size:10px;">#</th>
                ${headersHtml}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `;

    printHtmlDocument(html);
  };

  const renderTableCell = (p: Product, calc: ComputedProductAnalytics | undefined, colId: string) => {
    if (colId === 'barcode') {
      return <span className="font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400">{p.barcode}</span>;
    }
    if (colId === 'localCode') {
      return <span className="font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200">{p.localCode || '—'}</span>;
    }
    if (colId === 'mainCode') {
      return (
        <span className="text-[10px] uppercase font-extrabold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/70 px-1.5 py-0.5 rounded border border-indigo-200/50 dark:border-indigo-800">
          {p.mainCode || '—'}
        </span>
      );
    }
    if (colId === 'name') {
      return (
        <span className="font-bold text-slate-900 dark:text-white max-w-xs truncate block" title={p.name}>
          {p.name}
          {p.unit && <span className="ml-1 text-[10px] text-emerald-600 font-bold">({p.unit})</span>}
        </span>
      );
    }
    if (colId === 'category') {
      return <span className="text-slate-600 dark:text-slate-300 font-medium text-xs">{p.category || 'General'}</span>;
    }
    if (colId === 'costPrice') {
      return <span className="font-mono text-slate-600 dark:text-slate-300">{p.costPrice ? `₹${p.costPrice.toLocaleString('en-IN')}` : '—'}</span>;
    }
    if (colId === 'retailPrice') {
      return <span className="font-mono font-bold text-slate-900 dark:text-white">₹{(p.retailPrice || 0).toLocaleString('en-IN')}</span>;
    }
    if (colId === 'mrp') {
      return <span className="font-mono text-slate-500 dark:text-slate-400">₹{(p.mrp || 0).toLocaleString('en-IN')}</span>;
    }
    if (colId === 'marginPct') {
      return <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{calc ? `${calc.marginPct.toFixed(1)}%` : '—'}</span>;
    }
    if (colId === 'stock') {
      return (
        <span className={`font-bold ${p.stock <= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'}`}>
          {(p.stock || 0).toLocaleString('en-IN')}
        </span>
      );
    }
    if (colId === 'salesCount') {
      return <span className="font-bold text-indigo-600 dark:text-indigo-400">{(p.salesCount || 0).toLocaleString('en-IN')}</span>;
    }
    if (colId === 'avgDailySales') {
      const ads = calc ? calc.avgDailySales : (p.salesCount || 0) / 30;
      return <span className="font-mono text-slate-700 dark:text-slate-300">{ads.toFixed(2)}</span>;
    }
    if (colId === 'inventoryValue') {
      return <span className="font-mono font-black text-slate-900 dark:text-white">₹{(calc ? calc.inventoryValue : 0).toLocaleString('en-IN')}</span>;
    }
    if (colId === 'salesValue') {
      return <span className="font-mono font-bold text-slate-700 dark:text-slate-300">₹{(calc ? calc.salesValue : 0).toLocaleString('en-IN')}</span>;
    }
    if (colId === 'daysCover') {
      const avgDailySales = (p.salesCount || 0) / 30;
      const dc = avgDailySales > 0 ? p.stock / avgDailySales : p.stock <= 0 ? 0 : null;
      return <span className="font-mono text-slate-800 dark:text-slate-200">{dc !== null ? `${dc.toFixed(1)}d` : '—'}</span>;
    }
    if (colId === 'abcCategory') {
      return (
        <span
          className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
            calc?.abcCategory === 'A'
              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
              : calc?.abcCategory === 'B'
              ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
              : 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800'
          }`}
        >
          {calc ? calc.abcCategory : 'C'}
        </span>
      );
    }
    if (colId === 'movementStatus') {
      const vel = calc?.movementStatus || 'normal';
      return (
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
          vel === 'fast' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
          vel === 'slow' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
          vel === 'dead' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' :
          'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
        }`}>
          {vel}
        </span>
      );
    }
    if (colId === 'stockStatus') {
      const status = calc?.stockStatus || (p.stock <= 0 ? 'out_of_stock' : 'in_stock');
      return <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 capitalize">{status.replace(/_/g, ' ')}</span>;
    }
    if (colId === 'stockAgeGroup') {
      return <span className="text-[10px] text-slate-600 dark:text-slate-400">{calc?.stockAgeGroup || '—'}</span>;
    }
    if (colId === 'lastPurchaseDate') {
      return <span className="font-mono text-[10px] text-slate-600 dark:text-slate-400">{cleanDateOnly(p.lastPurchaseDate) || '—'}</span>;
    }

    // Custom rawRowData column
    if (colId.startsWith('custom_')) {
      const rawKey = colId.replace('custom_', '');
      const rawVal = p.rawRowData ? p.rawRowData[rawKey] : undefined;
      return (
        <span className="font-mono text-slate-600 dark:text-slate-300">
          {rawVal !== undefined && rawVal !== null ? String(rawVal) : '—'}
        </span>
      );
    }

    return null;
  };

  // Filtered column list for customization modal search
  const modalFilteredColumns = useMemo(() => {
    if (!columnSearchTerm.trim()) return columnConfigs;
    const term = columnSearchTerm.toLowerCase();
    return columnConfigs.filter((c) => c.label.toLowerCase().includes(term) || (c.category && c.category.toLowerCase().includes(term)));
  }, [columnConfigs, columnSearchTerm]);

  return (
    <div
      className={`p-2.5 sm:p-3.5 rounded-2xl border ${
        isDarkMode ? 'bg-slate-900 border-slate-800 text-white shadow-xl' : 'bg-white border-slate-200 text-slate-800 shadow-xs'
      } space-y-2.5`}
    >
      {/* Table Header & Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b pb-2.5 border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-sm sm:text-base font-black tracking-tight flex items-center gap-2">
            <span>{title}</span>
            <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/80 dark:text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
              {filteredProducts.length.toLocaleString('en-IN')} SKUs
            </span>
          </h2>
          {description && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
        </div>

        {/* Action Controls: Start Audit + Column Customization + Real Excel (.xlsx) + Print */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {onStartFloorAudit && (
            <button
              type="button"
              onClick={() => {
                const conds = [
                  selectedMainCodes.length > 0 ? `MainCodes: ${selectedMainCodes.join(', ')}` : '',
                  selectedCategories.length > 0 ? `Categories: ${selectedCategories.join(', ')}` : '',
                  selectedVelocity !== 'all' ? `Velocity: ${selectedVelocity}` : '',
                  selectedStockStatus !== 'all' ? `Stock Status: ${selectedStockStatus}` : '',
                  searchTerm ? `Search: "${searchTerm}"` : ''
                ].filter(Boolean).join(' | ');

                const meta = {
                  mainCodeFilter: selectedMainCodes,
                  categoryFilter: selectedCategories,
                  rankRange: selectedRankRange !== 'all' ? selectedRankRange : undefined,
                  filterConditions: conds || undefined
                };
                onStartFloorAudit(sortedProducts, meta);
              }}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-xs transition-all cursor-pointer active:scale-95 shrink-0"
              title={`Create Floor IQ audit using ${sortedProducts.length} filtered items`}
            >
              <ClipboardCheck className="w-4 h-4 text-emerald-100" />
              <span>Start Floor Audit ({sortedProducts.length})</span>
            </button>
          )}

          {/* Column Customization Button */}
          <button
            onClick={() => setShowColumnPicker(true)}
            className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold text-xs px-2.5 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 transition-all cursor-pointer active:scale-95 shadow-2xs"
            title="Customize Visible Columns for View & Excel Download"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Columns ({visibleColumns.length})</span>
          </button>

          {/* Copy Filtered Products Button */}
          <button
            onClick={handleCopy}
            disabled={sortedProducts.length === 0}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer"
            title={`Copy ${sortedProducts.length} filtered items (plain-text format for WhatsApp)`}
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copyFeedback || `COPY FILTERED PRODUCTS (${sortedProducts.length})`}</span>
          </button>

          {/* Real Formatted Excel (.xlsx) Export */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer"
            title="Download Custom Excel (.xlsx) containing only selected columns"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Excel (.xlsx)</span>
          </button>

          {/* Print / PDF Button */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-2.5 py-1.5 rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer"
            title="Print Clean Report"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Quick Presets & Scope Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
        <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 shrink-0 mr-1 flex items-center gap-1">
          <Building2 className="w-3 h-3 text-indigo-500" />
          Presets:
        </span>

        <button
          onClick={() => handleSetMainCodePreset('all')}
          className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 ${
            selectedMainCodes.length === 0
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
          }`}
        >
          All MainCodes
        </button>

        <button
          onClick={() => handleSetMainCodePreset('food')}
          className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 ${
            selectedMainCodes.length === 1 && selectedMainCodes[0] === 'FOOD'
              ? 'bg-emerald-600 text-white shadow-2xs'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-emerald-800 dark:text-emerald-300 hover:border-emerald-500'
          }`}
        >
          Food
        </button>

        <button
          onClick={() => handleSetMainCodePreset('grocery')}
          className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 ${
            selectedMainCodes.length === 1 && selectedMainCodes[0] === 'GROCERY'
              ? 'bg-amber-600 text-white shadow-2xs'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-amber-800 dark:text-amber-300 hover:border-amber-500'
          }`}
        >
          Grocery
        </button>

        <button
          onClick={() => handleSetMainCodePreset('nonfood')}
          className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 ${
            selectedMainCodes.length === 1 && selectedMainCodes[0] === 'NON-FOOD'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-blue-800 dark:text-blue-300 hover:border-blue-500'
          }`}
        >
          Non-Food
        </button>

        <button
          onClick={() => handleSetMainCodePreset('noncore')}
          className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 ${
            selectedMainCodes.length === 1 && selectedMainCodes[0] === 'NON-CORE'
              ? 'bg-purple-600 text-white shadow-2xs'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-purple-800 dark:text-purple-300 hover:border-purple-500'
          }`}
        >
          Non-Core
        </button>

        {(selectedMainCodes.length > 0 || selectedCategories.length > 0 || selectedVelocity !== 'all' || selectedStockStatus !== 'all' || selectedRankRange !== 'all' || searchTerm.trim()) && (
          <button
            onClick={handleResetFilters}
            className="px-2.5 py-1 rounded-lg font-bold text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-800 transition-all cursor-pointer shrink-0 flex items-center gap-1"
            title="Clear all active filters"
          >
            <RotateCcw className="w-3 h-3" />
            Clear Filters
          </button>
        )}
      </div>

      {/* Filter Row: Search, Multi-Select MainCode, Multi-Select Category, Velocity, Stock Status, Rank Range, Sort By */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-1.5 text-xs items-center">
        {/* Search Bar */}
        <div className="relative flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2 py-1.5">
          <Search className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, barcode..."
            className="bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none w-full font-medium"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="p-0.5 text-slate-400 hover:text-slate-600">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Multi-Select MainCode Dropdown */}
        <MultiSelectDropdown
          label="MainCode"
          options={mainCodes}
          selectedValues={selectedMainCodes}
          onChange={(vals) => {
            setSelectedMainCodes(vals);
            setPage(1);
          }}
          placeholder="All"
          searchPlaceholder="Search MainCodes..."
          icon={<Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
          isDarkMode={isDarkMode}
          badgeColor="indigo"
        />

        {/* Multi-Select Category Dropdown */}
        <MultiSelectDropdown
          label="Category"
          options={categories}
          selectedValues={selectedCategories}
          onChange={(vals) => {
            setSelectedCategories(vals);
            setPage(1);
          }}
          placeholder="All"
          searchPlaceholder="Search categories..."
          icon={<Tags className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
          isDarkMode={isDarkMode}
          badgeColor="emerald"
        />

        {/* Velocity Filter */}
        <div className="flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2 py-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-500 mr-1 shrink-0" />
          <select
            value={selectedVelocity}
            onChange={(e) => {
              setSelectedVelocity(e.target.value);
              setPage(1);
            }}
            className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none w-full font-medium truncate"
          >
            <option value="all">All Velocity</option>
            <option value="fast">⚡ Fast Moving</option>
            <option value="normal">Normal Velocity</option>
            <option value="slow">🐢 Slow Moving</option>
            <option value="dead">🛑 Dead Stock</option>
          </select>
        </div>

        {/* Rank Range Filter */}
        <div className="flex items-center bg-amber-50/80 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl px-2 py-1.5">
          <span className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-400 mr-1 shrink-0">Rank:</span>
          <select
            value={selectedRankRange}
            onChange={(e) => {
              setSelectedRankRange(e.target.value);
              setPage(1);
            }}
            className="bg-transparent text-xs text-amber-900 dark:text-amber-200 focus:outline-none w-full font-bold"
          >
            <option value="all">All Items</option>
            <option value="top_1_100">Top 1 - 100</option>
            <option value="top_101_200">Top 101 - 200</option>
            <option value="top_201_500">Top 201 - 500</option>
            <option value="top_501_1000">Top 501 - 1000</option>
            <option value="top_1_1000">Top 1 - 1000</option>
          </select>
        </div>

        {/* Sort By Filter */}
        <div className="flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2 py-1.5">
          <ArrowUpDown className="w-3.5 h-3.5 text-indigo-500 mr-1 shrink-0" />
          <select
            value={`${sortField}_${sortAsc ? 'asc' : 'desc'}`}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'stock_desc') {
                setSortField('stock');
                setSortAsc(false);
              } else if (val === 'stock_asc') {
                setSortField('stock');
                setSortAsc(true);
              } else if (val === 'sales_desc') {
                setSortField('sales');
                setSortAsc(false);
              } else if (val === 'sales_asc') {
                setSortField('sales');
                setSortAsc(true);
              } else if (val === 'inventoryValue_desc') {
                setSortField('inventoryValue');
                setSortAsc(false);
              } else if (val === 'daysCover_asc') {
                setSortField('daysCover');
                setSortAsc(true);
              } else if (val === 'marginPct_desc') {
                setSortField('marginPct');
                setSortAsc(false);
              } else if (val === 'name_asc') {
                setSortField('name');
                setSortAsc(true);
              }
              setPage(1);
            }}
            className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none w-full font-bold truncate"
          >
            <option value="inventoryValue_desc">Value (₹ High → Low)</option>
            <option value="stock_desc">Stock Qty (High → Low)</option>
            <option value="stock_asc">Stock Qty (Low → High)</option>
            <option value="sales_desc">Sales Qty (High → Low)</option>
            <option value="sales_asc">Sales Qty (Low → High)</option>
            <option value="daysCover_asc">Days Cover (Low → High)</option>
            <option value="marginPct_desc">Margin % (High → Low)</option>
            <option value="name_asc">Product Name (A → Z)</option>
          </select>
        </div>
      </div>

      {/* Reusable Linked Active Filter Chips */}
      <ActiveFilterChips
        groups={[
          {
            label: 'MainCode',
            values: selectedMainCodes,
            onRemove: (v) => {
              setSelectedMainCodes(selectedMainCodes.filter((c) => c !== v));
              setPage(1);
            },
            onClear: () => {
              setSelectedMainCodes([]);
              setPage(1);
            },
            badgeColor: 'indigo',
            incompatibleValues: mainCodes.filter((o) => o.incompatible).map((o) => o.value)
          },
          {
            label: 'Category',
            values: selectedCategories,
            onRemove: (v) => {
              setSelectedCategories(selectedCategories.filter((c) => c !== v));
              setPage(1);
            },
            onClear: () => {
              setSelectedCategories([]);
              setPage(1);
            },
            badgeColor: 'emerald',
            incompatibleValues: categories.filter((o) => o.incompatible).map((o) => o.value)
          }
        ]}
        onResetAll={handleResetFilters}
        totalFilteredCount={filteredProducts.length}
        totalItemCount={products.length}
        isDarkMode={isDarkMode}
      />
      {/* Desktop Table View (Compact High Density Professional Layout) */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-xs border-collapse">
          <thead
            className={`uppercase text-[9px] font-black tracking-wider ${
              isDarkMode ? 'bg-slate-950 text-slate-300 border-b border-slate-800' : 'bg-slate-100 text-slate-600 border-b border-slate-200'
            }`}
          >
            <tr>
              <th className="p-2 text-center w-8 text-slate-400">#</th>
              {visibleColumns.map((col) => (
                <th
                  key={col.id}
                  className={`p-2 whitespace-nowrap ${
                    ['costPrice', 'retailPrice', 'mrp', 'stock', 'salesCount', 'inventoryValue', 'salesValue', 'daysCover', 'avgDailySales', 'marginPct'].includes(
                      col.id
                    )
                      ? 'text-right'
                      : col.id === 'abcCategory' || col.id === 'movementStatus'
                      ? 'text-center'
                      : 'text-left'
                  } cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors`}
                  onClick={() => handleSort(col.id)}
                >
                  <div className="flex items-center gap-1 justify-between">
                    <span>{col.label}</span>
                    <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                  </div>
                </th>
              ))}
              {extraColumns?.map((col) => (
                <th key={col.key} className="p-2 text-left whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
            {paginatedProducts.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (extraColumns?.length || 0) + 1} className="p-8 text-center text-slate-400">
                  No matching products found.
                </td>
              </tr>
            ) : (
              paginatedProducts.map((p, idx) => {
                const calc = analyticsMap.get(p.id);
                const serialNo = (currentPage - 1) * pageSize + idx + 1;
                return (
                  <tr
                    key={p.id}
                    onClick={() => onSelectProduct(p)}
                    className="hover:bg-indigo-50/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                  >
                    <td className="p-2 text-center text-[10px] text-slate-400 font-mono">{serialNo}</td>
                    {visibleColumns.map((col) => (
                      <td
                        key={col.id}
                        className={`p-2 whitespace-nowrap ${
                          ['costPrice', 'retailPrice', 'mrp', 'stock', 'salesCount', 'inventoryValue', 'salesValue', 'daysCover', 'avgDailySales', 'marginPct'].includes(
                            col.id
                          )
                            ? 'text-right'
                            : col.id === 'abcCategory' || col.id === 'movementStatus'
                            ? 'text-center'
                            : 'text-left'
                        }`}
                      >
                        {renderTableCell(p, calc, col.id)}
                      </td>
                    ))}
                    {extraColumns?.map((col) => (
                      <td key={col.key} className="p-2 whitespace-nowrap">
                        {col.render(p, calc)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Compact Cards */}
      <div className="block md:hidden space-y-2">
        {paginatedProducts.length === 0 ? (
          <div className="p-6 text-center text-slate-400 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950">
            No matching products found.
          </div>
        ) : (
          paginatedProducts.map((p) => {
            const calc = analyticsMap.get(p.id);
            const isExpanded = !!expandedRowIds[p.id];
            const avgDailySales = (p.salesCount || 0) / 30;
            const daysCover = avgDailySales > 0 ? p.stock / avgDailySales : p.stock <= 0 ? 0 : null;
            const rawKeys = p.rawRowData ? Object.keys(p.rawRowData) : [];

            return (
              <div
                key={p.id}
                onClick={() => onSelectProduct(p)}
                className={`p-2.5 rounded-xl border ${
                  isDarkMode ? 'bg-slate-900/90 border-slate-800 hover:border-indigo-500' : 'bg-white border-slate-200 hover:border-indigo-400'
                } transition-all cursor-pointer flex flex-col gap-1 shadow-2xs`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xs font-black text-slate-900 dark:text-white leading-tight flex-1">
                    {p.name}
                    {p.unit && <span className="ml-1 text-[10px] text-emerald-600 font-bold">({p.unit})</span>}
                  </h3>
                  <span
                    className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 ${
                      calc?.abcCategory === 'A'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : calc?.abcCategory === 'B'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                    }`}
                  >
                    ABC: {calc ? calc.abcCategory : 'C'}
                  </span>
                </div>

                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Bar: {p.barcode}</span>
                  {p.localCode && (
                    <>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">Bansal: {p.localCode}</span>
                    </>
                  )}
                  {p.mainCode && (
                    <>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span className="text-[9px] uppercase font-bold bg-indigo-50 dark:bg-indigo-950/60 px-1 rounded text-indigo-700 dark:text-indigo-300">
                        Main: {p.mainCode}
                      </span>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-1 bg-slate-50 dark:bg-slate-950 p-1.5 rounded-lg border border-slate-200/60 dark:border-slate-800 text-[10px] text-center font-mono mt-0.5">
                  <div>
                    <span className="text-[8px] uppercase font-bold text-slate-400 block leading-none">Stock</span>
                    <span className={`font-bold block mt-0.5 ${p.stock <= 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}`}>
                      {p.stock || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-[8px] uppercase font-bold text-slate-400 block leading-none">Sales</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 block mt-0.5">{p.salesCount || 0}</span>
                  </div>
                  <div>
                    <span className="text-[8px] uppercase font-bold text-slate-400 block leading-none">Cover</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300 block mt-0.5">
                      {daysCover !== null ? `${daysCover.toFixed(1)}d` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[8px] uppercase font-bold text-slate-400 block leading-none">Value</span>
                    <span className="font-black text-slate-900 dark:text-white block mt-0.5">
                      ₹{(calc ? calc.inventoryValue : 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-800 dark:text-slate-200">Retail: ₹{p.retailPrice || 0}</span>
                    {p.costPrice ? <span className="text-slate-400">Cost: ₹{p.costPrice}</span> : null}
                  </div>

                  {rawKeys.length > 0 && (
                    <button
                      onClick={(e) => toggleRowExpanded(p.id, e)}
                      className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60"
                    >
                      {isExpanded ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      <span>{isExpanded ? 'Less' : `+${rawKeys.length} Fields`}</span>
                    </button>
                  )}
                </div>

                {isExpanded && p.rawRowData && (
                  <div
                    className="mt-1 p-2 bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 text-[10px] space-y-1 animate-fade-in"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[8px] uppercase font-black tracking-wider text-indigo-600 dark:text-indigo-400 block border-b border-slate-200 dark:border-slate-800 pb-0.5">
                      All Imported Properties ({rawKeys.length})
                    </span>
                    <div className="grid grid-cols-2 gap-1 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                      {Object.entries(p.rawRowData).map(([k, v]) => (
                        <div key={k} className="p-1 bg-white dark:bg-slate-900 rounded border border-slate-200/60 dark:border-slate-800">
                          <span className="text-[8px] text-slate-400 block font-bold truncate">{k}</span>
                          <span className="font-mono text-[9px] text-slate-800 dark:text-slate-200 truncate block font-bold">
                            {String(v || '—')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1.5 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>
            Showing {sortedProducts.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, sortedProducts.length)} of {sortedProducts.length} SKUs
          </span>
          <div className="flex items-center gap-1 ml-2">
            <span>Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded px-1.5 py-0.5 text-xs font-semibold"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-bold text-slate-800 dark:text-slate-200 px-2">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ADVANCED COLUMN CUSTOMIZATION MODAL */}
      {showColumnPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div
            className={`p-4 sm:p-5 rounded-2xl max-w-lg w-full border shadow-2xl space-y-3.5 ${
              isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-2.5 border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base leading-tight">Column Customization</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Visible in Table View & downloaded Excel (.xlsx) file
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowColumnPicker(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick search and select/deselect all actions */}
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={columnSearchTerm}
                  onChange={(e) => setColumnSearchTerm(e.target.value)}
                  placeholder="Filter columns..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleSelectAllColumns}
                  className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[10px] font-bold rounded-lg text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Select All
                </button>
                <button
                  onClick={handleDeselectAllColumns}
                  className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[10px] font-bold rounded-lg text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Columns Checkbox Grid */}
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
              {modalFilteredColumns.map((col) => (
                <label
                  key={col.id}
                  className={`flex items-center justify-between p-2 rounded-xl border transition-colors cursor-pointer text-xs font-bold ${
                    col.visible
                      ? 'bg-indigo-50/50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-slate-900 dark:text-white'
                      : 'border-slate-150 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={col.visible}
                      onChange={() => handleToggleColumn(col.id)}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                    />
                    <span>{col.label}</span>
                  </div>
                  {col.category && (
                    <span
                      className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                        col.isCustom
                          ? 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                          : 'text-slate-500 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {col.category}
                    </span>
                  )}
                </label>
              ))}
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex items-center justify-between pt-2.5 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={handleResetColumns}
                className="flex items-center gap-1 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset to Default</span>
              </button>

              <button
                onClick={() => setShowColumnPicker(false)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer shadow-xs active:scale-95"
              >
                Apply & Save ({visibleColumns.length} Active)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
