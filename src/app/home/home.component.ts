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
  daily?: { sales: number; growth: number };
  monthly_sales?: Array<{ Date: string; "Total Sales": number; "Growth Rate (%)": number }>;
  yearly?: { sales: number; growth: number };
  top_products?: Array<{ product: string; quantity: number; revenue: number }>;
  forecast?: { sales: number[]; dates: string[] };
}

interface FileItem {
  file_id: string;
  filename: string;
  upload_time: string;
}

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
  userFiles: FileItem[] = [];
  summary: DashboardSummary = {};
  selectedFile: string = '';

  @ViewChild('monthlySalesChart') monthlySalesChartRef!: ElementRef;
  @ViewChild('forecastChart') forecastChartRef!: ElementRef;

  private monthlySalesChart: Chart | null = null;
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

  fetchDashboardSummary() {
    if (!this.selectedFile) {
      alert('กรุณาเลือกไฟล์ก่อนโหลดข้อมูล Dashboard');
      return;
    }

    this.isLoading = true;

    const params = new HttpParams().set('file_id', this.selectedFile);
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
        this.summary = response;


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
    if (this.monthlySalesChart) this.monthlySalesChart.destroy();
    if (this.forecastChart) this.forecastChart.destroy();

    if (this.summary.monthly_sales && this.monthlySalesChartRef) {
      const ctx = this.monthlySalesChartRef.nativeElement.getContext('2d');
      this.monthlySalesChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: this.summary.monthly_sales.map(sale => sale.Date),
          datasets: [{
            label: 'ยอดขายรายเดือน',
            data: this.summary.monthly_sales.map(sale => sale["Total Sales"]),
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
        }
      });
    }

    if (this.summary.forecast && this.forecastChartRef) {
      const ctx = this.forecastChartRef.nativeElement.getContext('2d');
      this.forecastChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: this.summary.forecast.dates,
          datasets: [{
            label: 'พยากรณ์ยอดขาย',
            data: this.summary.forecast.sales,
            fill: false,
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.5)',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
        }
      });
    }
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
