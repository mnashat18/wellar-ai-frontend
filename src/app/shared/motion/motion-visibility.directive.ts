import {
  Directive,
  ElementRef,
  NgZone,
  OnDestroy,
  Renderer2
} from '@angular/core';

@Directive({
  selector: '[appMotionVisibility]',
  standalone: true
})
export class MotionVisibilityDirective implements OnDestroy {
  private observer?: IntersectionObserver;
  private readonly onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      this.renderer.addClass(this.element.nativeElement, 'motion-paused');
    } else {
      this.renderer.removeClass(this.element.nativeElement, 'motion-paused');
    }
  };

  constructor(
    private element: ElementRef<HTMLElement>,
    private renderer: Renderer2,
    private zone: NgZone
  ) {
    this.zone.runOutsideAngular(() => {
      if (typeof IntersectionObserver === 'undefined') {
        return;
      }

      this.observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && document.visibilityState === 'visible') {
            this.renderer.removeClass(this.element.nativeElement, 'motion-paused');
          } else {
            this.renderer.addClass(this.element.nativeElement, 'motion-paused');
          }
        },
        { threshold: 0.01 }
      );

      this.observer.observe(this.element.nativeElement);
      document.addEventListener('visibilitychange', this.onVisibilityChange, { passive: true });
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }
}
