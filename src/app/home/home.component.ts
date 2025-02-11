import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
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
import { PaymentDialogComponent } from '../payment-dialog/payment-dialog.component';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.css';

Chart.register(...registerables);

interface UserInfo {
  username: string;
  points: number;
}

interface DashboardSummary {
  ai_summary?: string;
  daily_sales?: Array<{ Date: string; "Total Sales": number; "Quantity Sold": number }>;
  monthly_sales?: Array<{ Date: string; "Total Sales": number; "Growth Rate (%)": number; "Quantity Sold": number }>;
  yearly_sales?: Array<{ Date: string; "Total Sales": number; "Growth Rate (%)": number; "Quantity Sold": number }>;
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
  imports: [CommonModule, FormsModule, PaymentDialogComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
})
export class HomeComponent implements OnInit, AfterViewInit {
  @ViewChild('dateRangePicker') dateRangePickerEl!: ElementRef;
  private flatpickrInstance: any;
  minDate: Date | null = null;
  maxDate: Date | null = null;
  
  userPoints: number = 0;
  isDarkMode = false;
  isLoading = false;
  isCompare = false;
  isForecast_quantity = false;
  isAi_summary = false;
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
  showPaymentDialog = false;
  ai_summary: string = '';
  pollingInterval: any; 

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
    this.getUserInfo();
    this.getFiles();
    this.initializeMonths();
  }

    ngAfterViewInit() {
    this.initializeDatePicker();
  }

  initializeDatePicker() {
    if (this.dateRangePickerEl) {
      this.flatpickrInstance = flatpickr(this.dateRangePickerEl.nativeElement, {
        mode: 'range',
        dateFormat: 'Y-m-d',
        minDate: this.minDate ?? new Date(),
        maxDate: this.maxDate ?? new Date(),
        // defaultDate: [new Date(), new Date()],
        defaultDate: [new Date(), new Date()].filter(Boolean),
        // theme: this.isDarkMode ? 'dark' : 'light',
        onChange: (selectedDates) => {
          if (selectedDates.length === 2) {
            const [start, end] = selectedDates;
            const startDate = this.formatDate(start);
            const endDate = this.formatDate(end);
            this.selectedMonth = `${startDate}:${endDate}`;
            this.fetchDashboardSummary();
          }
        }
      });
    }
  }

     formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getUserInfo() {
    this.isLoading = false;
  const headers = new HttpHeaders({
    'Authorization': `Bearer ${this.authService.getToken()}`,
    'Accept': 'application/json',
    'ngrok-skip-browser-warning': 'true'
  });

  this.http.get<{ user_info: { points: number; username: string } }>(
    `${environment.BASE_URL}/user_info/`,
    { headers }
  ).pipe(
    catchError(this.handleError.bind(this))
  ).subscribe({
    next: (response) => {
      console.log("User Info API Response:", response); 
      if (this.userPoints !== response.user_info.points) {
        this.userPoints = response.user_info.points;
        this.stopPolling();
      }
    },
    error: (error) => {
      console.error('Failed to fetch user info:', error);
    }
  });
}

  // initializeMonths() {
  //   if (!this.summary || !this.summary.daily_sales) {
  //     console.warn("No daily sales data available.");
  //     return;
  //   }
  //   const monthSet = new Set<string>();

  //   this.summary.daily_sales.forEach(sale => {
  //     const date = sale.Date;
  //     const yearMonth = date.substring(0, 7);
  //     monthSet.add(yearMonth);
  //   });

  //   this.availableMonths = Array.from(monthSet).sort();

  //   const currentDate = new Date();
  //   this.selectedMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
  //   this.selectedMonth = "";
  // }
initializeMonths() {
    if (!this.summary || !this.summary.daily_sales) {
      console.warn("No daily sales data available.");
      return;
    }

    const dates = this.summary.daily_sales.map(sale => new Date(sale.Date));
    this.minDate = new Date(Math.min(...dates.map(date => date.getTime())));
    this.maxDate = new Date(Math.max(...dates.map(date => date.getTime())));

    if (this.flatpickrInstance) {
      this.flatpickrInstance.set('minDate', this.minDate);
      this.flatpickrInstance.set('maxDate', this.maxDate);
    }
  }

  toggleDarkMode() {
    this.themeService.toggleDarkMode();
    if (this.flatpickrInstance) {
      this.flatpickrInstance.set('theme', this.isDarkMode ? 'dark' : 'light');
    }
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
        // this.userFiles = response.files;
        if (this.userFiles !== response.files) {
        this.userFiles = response.files;
        this.startPolling();
      }
        this.isLoading = false;
        this.startPolling();
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
    this.isForecast_quantity = false;
    this.isAi_summary = false;
    this.ai_summary = '';
    this.selectedReportType = type;
    if(type === 'compare_trends'){
      this.isCompare = true;
    } else {
      this.isCompare = false;
      this.setReportType1('monthly')
    }
    if (this.selectedFile) {
      this.fetchDashboardSummary();
    }
  }

  setReportType1(type: ReportType) {
    this.isForecast_quantity = false;
    this.isAi_summary = false;
    this.ai_summary = '';
    this.selectedReportType1 = type;
    if (this.selectedFile) {
      this.fetchDashboardSummary();
    }
  }

  Gensummary() {
    this.isForecast_quantity = true;
    this.isAi_summary = true;
    this.fetchDashboardSummary();
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
      .set('time_filter', this.selectedReportType1)
      .set('forecast_quantity', this.isForecast_quantity)
      .set('ai_summary', this.isAi_summary);

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
        this.isLoading = false;
        console.log("API Response:", response);
        this.summary = response;
        if (this.summary.ai_summary) {
          this.ai_summary = this.summary.ai_summary;
        }
        this.initializeMonths();
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
      let labels: string[] = [];
      let data: any[] = [];
      let title = '';
      
      if (this.selectedReportType === 'compare_trends' && this.summary.compare_trends) {
        let filteredTrends = this.summary.compare_trends;

        if (this.selectedReportType1 === 'daily' && this.selectedMonth) {
          filteredTrends = filteredTrends.filter(item => item.Date.startsWith(this.selectedMonth));
        }

        const productGroups = filteredTrends.reduce((groups: { [key: string]: any[] }, item) => {
          const product = item.Product;
          if (!groups[product]) groups[product] = [];
          groups[product].push(item);
          return groups;
        }, {});

        const dates = [...new Set(filteredTrends.map(item => item.Date))];

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
        let quantityData: number[] = [];
        let filteredData: any[] = [];

        switch (this.selectedReportType) {
          case 'daily':
            if (this.summary.daily_sales) {
              filteredData = this.summary.daily_sales.filter(sale => sale.Date.startsWith(this.selectedMonth));
              labels = filteredData.map(sale => sale.Date);
              data = filteredData.map(sale => sale["Total Sales"]);
              quantityData = filteredData.map(sale => sale["Quantity Sold"]);
              title = `Daily Sales ${this.selectedMonth ? `- ${this.selectedMonth}` : ''}`;
            }
            break;
          case 'monthly':
            if (this.summary.monthly_sales) {
              filteredData = this.summary.monthly_sales;
              labels = this.summary.monthly_sales.map(sale => sale.Date);
              data = this.summary.monthly_sales.map(sale => sale["Total Sales"]);
              quantityData = filteredData.map(sale => sale["Quantity Sold"]);
              title = 'Monthly Sales';
            }
            break;
          case 'yearly':
            if (this.summary.yearly_sales) {
              filteredData = this.summary.yearly_sales;
              labels = this.summary.yearly_sales.map(sale => sale.Date);
              data = this.summary.yearly_sales.map(sale => sale["Total Sales"]);
              quantityData = filteredData.map(sale => sale["Quantity Sold"]);
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
                },
                legend: {
                  display: true
                },
                tooltip: {
                  callbacks: {
                    label: (tooltipItem) => {
                      const datasets = tooltipItem.chart.data.datasets; 
                      const index = tooltipItem.dataIndex;
                      let totalSales = filteredData?.[index]?.["Total Sales"] ?? 0;
                      let quantitySold = filteredData?.[index]?.["Quantity Sold"] ?? 0;

                       if (this.selectedReportType === 'compare_trends') {
        const product = datasets[tooltipItem.datasetIndex].label;
        totalSales = datasets[tooltipItem.datasetIndex].data[index] ?? 0;
        return [`${product}: ${totalSales.toLocaleString()}`];
      } else {
        totalSales = filteredData?.[index]?.["Total Sales"] ?? 0;
        quantitySold = filteredData?.[index]?.["Quantity Sold"] ?? 0;
              
                      return [`Total Sales: ${totalSales.toLocaleString()}`, `Quantity Sold: ${quantitySold.toLocaleString()}`];}
                    }
                  }
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
                    text: this.selectedReportType === 'daily' ? 'Date' : this.selectedReportType === 'monthly' ? 'Month' : 'Year'
                  }
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

  openPaymentDialog() {
    this.showPaymentDialog = true;
    this.isLoading = false;
    this.getUserInfo();
    this.startPolling();
  }

  closePaymentDialog() {
    this.showPaymentDialog = false;
    this.isLoading = false;
    this.getUserInfo();
  }

  startPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(() => {
      this.getUserInfo();
    }, 3000);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}