import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PostAuthWelcomeComponent } from './post-auth-welcome.component';
import { PostAuthWelcomeService, type PostAuthWelcomeIntent } from '../../../services/post-auth-welcome.service';
import { vi } from 'vitest';

describe('PostAuthWelcomeComponent', () => {
  let fixture: ComponentFixture<PostAuthWelcomeComponent>;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [PostAuthWelcomeComponent],
      providers: [{ provide: PostAuthWelcomeService, useValue: { clear: () => undefined } }]
    }).compileComponents();
    fixture = TestBed.createComponent(PostAuthWelcomeComponent);
  });

  afterEach(() => vi.useRealTimers());

  it('renders a dismissible welcome intent', async () => {
    const intent: PostAuthWelcomeIntent = {
      kind: 'returning',
      firstName: 'Sam',
      organizationName: null,
      destinationRoute: '/app/dashboard'
    };
    fixture.componentInstance.intent = intent;
    fixture.componentInstance.activeIntent = intent;
    fixture.componentInstance.showing = true;
    fixture.componentInstance.isVisible = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Welcome back, Sam');
    expect(fixture.nativeElement.querySelector('button[aria-label="Dismiss welcome"]')).toBeTruthy();
  });
});
