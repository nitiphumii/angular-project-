import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../services/theme.service';
import { AuthService } from '../services/auth.service';
import { HttpClient, HttpParams, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Chart, registerables } from 'chart.js';
import { Router } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { environment } from '../../environments/environment';
Chart.register(...registerables);

interface DashboardSummary {
  daily_sales?: Array<{ Date: string; "Total Sales": number; "Quantity Sold": number }>;
  monthly_sales?: Array<{ Date: string; "Total Sales": number; "Growth Rate (%)": number; "Quantity Sold": number }>;
  yearly_sales?: Array<{ Date: string; "Total Sales": number; "Growth Rate (%)": number }>;
  top_products?: Array<{ Product: string; "Total Sales": number }>;
  compare_trends?: Array<{ Date: string; Product: string; "Total Sales": number; "Quantity Sold": number}>;
  forecast?: Array<{ Date: string; "Forecasted Sales": number }>;
}

interface FileItem {
  file_id: string;
  filename: string;
  upload_time: string;
  products?: Array<{ Product: string; "Total Sales": number }>;
}

type ReportType = 'daily' | 'monthly' | 'yearly' | 'top_products' | 'compare_trends' | 'forecast';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
})
export class HomeComponent implements OnInit {
  isDarkMode = false;
  isLoading = false;
  isCompare = false;
  userFiles: FileItem[] = [];
  summary: DashboardSummary = {};
  selectedFile: string = '';
  selectedReportType: ReportType = 'daily';
  selectedReportType1: ReportType = 'yearly';
  selectedProduct: string = '';
  selectedMonth: string = '';
  availableProducts: Array<{ Product: string; "Total Sales": number }> = [];
  availableMonths: string[] = [];
  selectedForecastPeriods: number = 3;
  forecastPeriods: number[] = Array.from({length: 10}, (_, i) => i + 2);

  @ViewChild('salesChart') salesChartRef!: ElementRef;
  @ViewChild('forecastChart') forecastChartRef!: ElementRef;

  private salesChart: Chart | null = null;
  private forecastChart: Chart | null = null;

  constructor(
    private themeService: ThemeService,
    private authService: AuthService,
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit() {
    this.themeService.darkMode$.subscribe(isDark => this.isDarkMode = isDark);
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
    this.getFiles();
    this.initializeMonths();
  }

  initializeMonths() {
    if (!this.summary || !this.summary.daily_sales) {
      console.warn("No daily sales data available.");
      return;
    }
    const monthSet = new Set<string>();

    this.summary.daily_sales.forEach(sale => {
      const date = sale.Date;
      const yearMonth = date.substring(0, 7);
      monthSet.add(yearMonth);
    });

    this.availableMonths = Array.from(monthSet).sort();

    const currentDate = new Date();
    this.selectedMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    this.selectedMonth = "";
  }

  toggleDarkMode() {
    this.themeService.toggleDarkMode();
  }

  getFiles() {
    this.isLoading = true;
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getToken()}`,
      'Accept': 'application/json',
      'ngrok-skip-browser-warning': 'true'
    });

    this.http.get<{ files: FileItem[] }>(
      `${environment.BASE_URL}/getfiles/`,
      { headers }
    ).pipe(
      catchError(this.handleError.bind(this))
    ).subscribe({
      next: (response) => {
        this.userFiles = response.files;
        this.isLoading = false;
      },
      error: (error) => {
        this.isLoading = false;
        alert(error.message || 'Failed to fetch files');
      }
    });
  }

  onFileSelect(fileId: string) {
    this.selectedFile = fileId;
    this.selectedProduct = '';
    this.fetchInitialData();
  }

  onMonthSelect(month: string) {
    this.selectedMonth = month;
    this.renderCharts();
  }

  fetchInitialData() {
    if (!this.selectedFile) return;

    this.isLoading = true;
    const params = new HttpParams()
      .set('file_id', this.selectedFile)
      .set('report_type', 'top_products');

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getToken()}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true'
    });

    this.http.get<DashboardSummary>(
      `${environment.BASE_URL}/dashboard/summary/`,
      { params, headers }
    ).pipe(
      catchError(this.handleError.bind(this))
    ).subscribe({
      next: (response) => {
        if (response.top_products) {
          const selectedFileIndex = this.userFiles.findIndex(f => f.file_id === this.selectedFile);
          if (selectedFileIndex !== -1) {
            this.userFiles[selectedFileIndex].products = response.top_products;
            this.availableProducts = response.top_products;
            console.log("Product Data:", this.availableProducts);
          }
        }
        this.fetchDashboardSummary();
      },
      error: (error) => {
        this.isLoading = false;
        alert(error.message || 'Failed to fetch initial data');
      }
    });
  }

  setReportType(type: ReportType) {
    this.selectedReportType = type;
    if(type === 'compare_trends'){
      this.isCompare = true;
    } else {
      this.isCompare = false;
    }
    if (this.selectedFile) {
      this.fetchDashboardSummary();
    }
  }

  setReportType1(type: ReportType) {
    this.selectedReportType1 = type;
    if (this.selectedFile) {
      this.fetchDashboardSummary();
    }
  }

  fetchDashboardSummary() {
    if (!this.selectedFile) {
      alert('กรุณาเลือกไฟล์ก่อนโหลดข้อมูล Dashboard');
      return;
    }

    this.isLoading = true;

    let params = new HttpParams()
      .set('file_id', this.selectedFile)
      .set('report_type', this.selectedReportType)
      .set('time_filter', this.selectedReportType1);

    // Add forecast periods parameter when in forecast mode
    if (this.selectedReportType === 'forecast') {
      params = params.set('forecast_periods', this.selectedForecastPeriods.toString());
    } else {
      params = params.set('forecast_3', 'true');
    }

    if (this.selectedProduct) {
      params = params.set('product_filter', this.selectedProduct);
    }

    if (this.selectedReportType === 'daily' && this.selectedMonth) {
      params = params.set('month_filter', this.selectedMonth);
    }

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getToken()}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true'
    });

    this.http.get<DashboardSummary>(
      `${environment.BASE_URL}/dashboard/summary/`, 
      { params, headers }
    ).pipe(
      catchError(this.handleError.bind(this))
    ).subscribe({
      next: (response) => {
        console.log("API Response:", response);
        this.summary = response;
        this.initializeMonths();
        this.isLoading = false;
        this.renderCharts();
      },
      error: (error) => {
        this.isLoading = false;
        alert(error.message || 'Failed to fetch dashboard data');
      }
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.isLoading = true;
      const formData = new FormData();
      formData.append('file', input.files[0]);

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${this.authService.getToken()}`,
        'ngrok-skip-browser-warning': 'true'
      });

      this.http.post<{ file_id: string }>(
        `${environment.BASE_URL}/upload/`, 
        formData,
        { headers }
      ).pipe(catchError(this.handleError.bind(this)))
      .subscribe({
        next: (response) => {
          this.getFiles();
          this.isLoading = false;
        },
        error: (error) => {
          this.isLoading = false;
          alert(error.message || 'Failed to upload file');
        }
      });
    }
  }

  renderCharts() {
    if (this.salesChart) this.salesChart.destroy();
    if (this.forecastChart) this.forecastChart.destroy();

    if (this.salesChartRef) {
      const ctx = this.salesChartRef.nativeElement.getContext('2d');
      
      if (this.selectedReportType === 'compare_trends' && this.summary.compare_trends) {
        const productGroups = this.summary.compare_trends.reduce((groups: { [key: string]: any[] }, item) => {
          const product = item.Product;
          if (!groups[product]) {
            groups[product] = [];
          }
          groups[product].push(item);
          return groups;
        }, {});

        const dates = [...new Set(this.summary.compare_trends.map(item => item.Date))];

        const datasets = Object.entries(productGroups).map(([product, data], index) => ({
          label: product,
          data: data.map(item => item["Total Sales"]),
          borderColor: this.getColor(index),
          backgroundColor: this.getColor(index, 0.2),
          fill: false,
          tension: 0.4
        }));

        this.salesChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: dates,
            datasets: datasets
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: 'Product Sales Comparison'
              },
              legend: {
                display: true,
                position: 'top'
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: 'Total Sales'
                }
              },
              x: {
                title: {
                  display: true,
                  text: 'Date'
                }
              }
            }
          }
        });
      } else if (this.selectedReportType === 'forecast' && this.summary.forecast) {
        const dates = this.summary.forecast.map(item => item.Date);
        const forecastedSales = this.summary.forecast.map(item => item["Forecasted Sales"]);

        this.salesChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: dates,
            datasets: [{
              label: 'Sales Forecast',
              data: forecastedSales,
              borderColor: 'rgba(255, 99, 132, 1)',
              backgroundColor: 'rgba(255, 99, 132, 0.2)',
              fill: true,
              tension: 0.4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: 'Sales Forecast'
              },
              legend: {
                display: true,
                position: 'top'
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: 'Forecasted Sales'
                }
              },
              x: {
                title: {
                  display: true,
                  text: 'Date'
                }
              }
            }
          }
        });
      } else {
        let labels: string[] = [];
        let data: number[] = [];
        let title = '';

        switch (this.selectedReportType) {
          case 'daily':
            if (this.summary.daily_sales) {
              const filteredData = this.summary.daily_sales.filter(sale => sale.Date.startsWith(this.selectedMonth));
              labels = filteredData.map(sale => sale.Date);
              data = filteredData.map(sale => sale["Total Sales"]);
              title = `Daily Sales ${this.selectedMonth ? `- ${this.selectedMonth}` : ''}`;
            }
            break;
          case 'monthly':
            if (this.summary.monthly_sales) {
              labels = this.summary.monthly_sales.map(sale => sale.Date);
              data = this.summary.monthly_sales.map(sale => sale["Total Sales"]);
              title = 'Monthly Sales';
            }
            break;
          case 'yearly':
            if (this.summary.yearly_sales) {
              labels = this.summary.yearly_sales.map(sale => sale.Date);
              data = this.summary.yearly_sales.map(sale => sale["Total Sales"]);
              title = 'Yearly Sales';
            }
            break;
        }

        if (labels.length > 0 && data.length > 0) {
          this.salesChart = new Chart(ctx, {
            type: 'bar',
            data: {
              labels: labels,
              datasets: [{
                label: title,
                data: data,
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                title: {
                  display: true,
                  text: title
                }
              }
            }
          });
        }
      }
    }
  }

  private getColor(index: number, alpha: number = 1): string {
    const colors = [
      `rgba(255, 99, 132, ${alpha})`,   // Red
      `rgba(54, 162, 235, ${alpha})`,   // Blue
      `rgba(255, 206, 86, ${alpha})`,   // Yellow
      `rgba(75, 192, 192, ${alpha})`,   // Green
      `rgba(153, 102, 255, ${alpha})`,  // Purple
      `rgba(255, 159, 64, ${alpha})`,   // Orange
      `rgba(199, 199, 199, ${alpha})`,  // Gray
      `rgba(83, 102, 255, ${alpha})`,   // Indigo
      `rgba(255, 99, 255, ${alpha})`,   // Pink
      `rgba(99, 255, 132, ${alpha})`    // Mint
    ];
    return colors[index % colors.length];
  }

  private handleError(error: HttpErrorResponse) {
    console.error('An error occurred:', error);
    if (error.status === 401) {
      this.authService.clearToken();
      this.router.navigate(['/login']);
      return throwError(() => new Error('Unauthorized access'));
    }
    if (error.status === 0) {
      return throwError(() => new Error('Network error occurred'));
    }
    return throwError(() => new Error(error.error?.message || 'An unexpected error occurred'));
  }
}