import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SystemConsoleComponent } from './system-console.component';

describe('SystemConsoleComponent', () => {
  let component: SystemConsoleComponent;
  let fixture: ComponentFixture<SystemConsoleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SystemConsoleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SystemConsoleComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
