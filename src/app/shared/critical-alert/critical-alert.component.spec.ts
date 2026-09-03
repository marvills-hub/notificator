import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CriticalAlertComponent } from './critical-alert.component';

describe('CriticalAlertComponent', () => {
  let component: CriticalAlertComponent;
  let fixture: ComponentFixture<CriticalAlertComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CriticalAlertComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CriticalAlertComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
