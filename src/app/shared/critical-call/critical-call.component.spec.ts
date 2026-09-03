import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CriticalCallComponent } from './critical-call.component';

describe('CriticalCallComponent', () => {
  let component: CriticalCallComponent;
  let fixture: ComponentFixture<CriticalCallComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CriticalCallComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CriticalCallComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
