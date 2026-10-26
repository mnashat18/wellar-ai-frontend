import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach } from 'vitest';
import { provideRouter } from '@angular/router';

import { PublicLayout } from './public.layout';

describe('PublicLayout', () => {
  let component: PublicLayout;
  let fixture: ComponentFixture<PublicLayout>;
  let matchMediaDescriptor: PropertyDescriptor | undefined;

  beforeEach(async () => {
    matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    await TestBed.configureTestingModule({
      imports: [PublicLayout],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PublicLayout);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    if (matchMediaDescriptor) {
      Object.defineProperty(window, 'matchMedia', matchMediaDescriptor);
    } else {
      Reflect.deleteProperty(window, 'matchMedia');
    }
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('sets compact navigation accessibility state before the first view check', () => {
    fixture.destroy();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as MediaQueryList)) });

    fixture = TestBed.createComponent(PublicLayout);
    component = fixture.componentInstance;

    expect(() => fixture.detectChanges()).not.toThrow();
    expect(() => fixture.checkNoChanges()).not.toThrow();

    const nav = fixture.nativeElement.querySelector('#public-nav') as HTMLElement;
    expect(nav.getAttribute('aria-hidden')).toBe('true');
    expect(nav.hasAttribute('inert')).toBe(true);
  });
});
