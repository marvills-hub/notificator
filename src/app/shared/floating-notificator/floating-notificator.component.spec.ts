import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FloatingNotificatorComponent } from './floating-notificator.component';

describe('FloatingNotificatorComponent', () => {
  let component: FloatingNotificatorComponent;
  let fixture: ComponentFixture<FloatingNotificatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FloatingNotificatorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FloatingNotificatorComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
