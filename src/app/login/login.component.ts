import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ThemeService } from '../services/theme.service';
import { AuthService } from '../services/auth.service';
import { HttpClient } from '@angular/common/http';

interface LoginResponse {
  token: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  loginData = {
    username: '',
    password: ''
  };

  isDarkMode = false;
  showPassword: boolean = false;
  
  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }
  
  constructor(
    private router: Router,
    private themeService: ThemeService,
    private authService: AuthService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.themeService.darkMode$.subscribe(
      isDark => this.isDarkMode = isDark
    );
  }

  toggleDarkMode() {
    this.themeService.toggleDarkMode();
  }

  onSubmit() {
    const formData = new FormData();
    formData.append('username', this.loginData.username);
    formData.append('password', this.loginData.password);

    this.http.post<LoginResponse>('https://4e1f-49-237-22-17.ngrok-free.app/login', formData)
      .subscribe({
        next: (response) => {
          console.log('Login successful:', response);
          this.authService.setToken(response.token);
          this.router.navigate(['/home']);
        },
        error: (error) => {
          console.error('Login failed:', error);
          alert('Login failed. Please check your credentials and try again.');
        }
      });
  }
}