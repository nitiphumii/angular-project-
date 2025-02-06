import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../services/theme.service';
import { AuthService } from '../services/auth.service';
import { HttpClient, HttpParams, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

// Response interface for dashboard summary
interface DashboardSummary {
  daily?: {
    sales: number;
    growth: number;
  };
  monthly_sales?: Array<{
    Date: string;
    "Total Sales": number;
    "Growth Rate (%)": number;
  }>;
  yearly?: {
    sales: number;
    growth: number;
  };
  top_products?: Array<{
    product: string;
    quantity: number;
    revenue: number;
  }>;
  forecast?: {
    sales: number[];
    dates: string[];
  };
}

// Request parameters interface
interface DashboardParams {
  file_id: string;                                                           // Required: File ID from upload API
  report_type?: 'daily' | 'monthly' | 'yearly' | 'top_products' | 'forecast' | 'all'; // Optional: defaults to 'all'
  product_filter?: string;                                                   // Optional: product name filter
  forecast_periods?: number;                                                 // Optional: defaults to 3
  forecast_quantity?: boolean;                                              // Optional: defaults to false
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  isDarkMode = false;
  isLoading = false;
  summary: DashboardSummary = {};
  currentFileId: string = '';

  // Default dashboard parameters
  private defaultParams: Partial<DashboardParams> = {
    report_type: 'all',
    forecast_periods: 3,
    forecast_quantity: false
  };

  constructor(
    private themeService: ThemeService,
    private authService: AuthService,
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit() {
    this.themeService.darkMode$.subscribe(
      isDark => this.isDarkMode = isDark
    );

    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
  }

  toggleDarkMode() {
    this.themeService.toggleDarkMode();
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
    
    const message = error.error?.message || 'An unexpected error occurred';
    return throwError(() => new Error(message));
  }

  fetchDashboardSummary(customParams: Partial<DashboardParams> = {}) {
    if (!this.currentFileId) {
      console.error('No file ID available');
      return;
    }

    this.isLoading = true;
    
    // Merge default parameters with custom parameters
    const params: DashboardParams = {
      file_id: this.currentFileId,
      ...this.defaultParams,
      ...customParams
    };

    // Build query parameters
    let httpParams = new HttpParams()
      .set('file_id', params.file_id);

    // Add optional parameters only if they are provided
    if (params.report_type) {
      httpParams = httpParams.set('report_type', params.report_type);
    }

    if (params.product_filter) {
      httpParams = httpParams.set('product_filter', params.product_filter);
    }

    if (params.forecast_periods !== undefined) {
      httpParams = httpParams.set('forecast_periods', params.forecast_periods.toString());
    }

    if (params.forecast_quantity !== undefined) {
      httpParams = httpParams.set('forecast_quantity', params.forecast_quantity.toString());
    }

    const headers = new HttpHeaders()
      .set('Authorization', `Bearer ${this.authService.getToken()}`)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json');

    this.http.get<DashboardSummary>(
      'https://8bae-49-237-17-139.ngrok-free.app/dashboard/summary/', 
      { 
        params: httpParams, 
        headers,
        observe: 'response',
        responseType: 'json'
      }
    ).pipe(
      catchError(this.handleError.bind(this))
    ).subscribe({
      next: (response) => {
        if (response.body) {
          this.summary = response.body;
        }
        this.isLoading = false;
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
      
      const headers = new HttpHeaders()
        .set('Authorization', `Bearer ${this.authService.getToken()}`);

      this.http.post<{file_id: string}>(
        'https://8bae-49-237-17-139.ngrok-free.app/upload/', 
        formData,
        { headers }
      ).pipe(
        catchError(this.handleError.bind(this))
      ).subscribe({
        next: (response) => {
          console.log('File uploaded successfully:', response);
          this.currentFileId = response.file_id;
          // Call fetchDashboardSummary with default parameters
          this.fetchDashboardSummary();
        },
        error: (error) => {
          this.isLoading = false;
          alert(error.message || 'Failed to upload file');
        }
      });
    }
  }
}