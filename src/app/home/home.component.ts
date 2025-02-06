import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../services/theme.service';
import { AuthService } from '../services/auth.service';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';

interface DashboardSummary {
  daily?: {
    sales: number;
    growth: number;
  };
  monthly?: {
    sales: number;
    growth: number;
  };
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

    // Check if user is authenticated
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
  }

  toggleDarkMode() {
    this.themeService.toggleDarkMode();
  }

  fetchDashboardSummary(reportType: string = 'all') {
    this.isLoading = true;
    
    let params = new HttpParams()
      .set('file_id', this.currentFileId)
      .set('report_type', reportType)
      .set('forecast_periods', '3')
      .set('forecast_quantity', 'false');
    
    // เช็คว่า product_filter มีค่าหรือไม่ ก่อนเพิ่มเข้าไปใน params
    const productFilter = 'Bagel'; // หรือดึงค่าจาก UI
    if (productFilter) {
      params = params.set('product_filter', productFilter);
    }

    const headers = new HttpHeaders()
      .set('Authorization', `Bearer ${this.authService.getToken()}`)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json');

    this.http.get<DashboardSummary>('https://8bae-49-237-17-139.ngrok-free.app/dashboard/summary/', 
      { 
        params, 
        headers,
        responseType: 'json'
      }
    ).subscribe({
      next: (data) => {
        this.summary = data;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching dashboard summary:', error);
        if (error.status === 401) {
          this.router.navigate(['/login']);
        } else {
          alert('Error fetching dashboard data. Please try again.');
        }
        this.isLoading = false;
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
        .set('Authorization', `Bearer ${this.authService.getToken()}`)
        .set('Accept', 'application/json');

      this.http.post<{file_id: string}>(
        'https://8bae-49-237-17-139.ngrok-free.app/upload/', 
        formData,
        { headers }
      ).subscribe({
        next: (response) => {
          console.log('File uploaded successfully:', response);
          this.currentFileId = response.file_id;
          this.fetchDashboardSummary();
        },
        error: (error) => {
          console.error('Error uploading file:', error);
          if (error.status === 401) {
            this.router.navigate(['/login']);
          } else {
            alert('Error uploading file. Please try again.');
          }
          this.isLoading = false;
        }
      });
    }
  }
}