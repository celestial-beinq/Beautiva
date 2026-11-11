import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-table-pagination',
  standalone: true,
  imports: [],
  templateUrl: './table-pagination.component.html',
  styleUrl: './table-pagination.component.css',
})
export class TablePaginationComponent {
  readonly totalItems = input.required<number>();
  readonly page = input.required<number>();
  readonly pageSize = input<number>(10);
  readonly pageSizeOptions = input<number[]>([5, 10, 20, 50]);

  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalItems() / Math.max(1, this.pageSize()))),
  );

  readonly safePage = computed(() =>
    Math.min(Math.max(1, this.page()), this.totalPages()),
  );

  readonly startItem = computed(() =>
    this.totalItems() === 0 ? 0 : (this.safePage() - 1) * this.pageSize() + 1,
  );

  readonly endItem = computed(() =>
    Math.min(this.safePage() * this.pageSize(), this.totalItems()),
  );

  readonly pageTokens = computed<Array<number | 'ellipsis'>>(() => {
    const total = this.totalPages();
    const current = this.safePage();
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    const tokens: Array<number | 'ellipsis'> = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    if (start > 2) tokens.push('ellipsis');
    for (let p = start; p <= end; p++) tokens.push(p);
    if (end < total - 1) tokens.push('ellipsis');
    tokens.push(total);
    return tokens;
  });

  goToPage(next: number): void {
    const clamped = Math.min(Math.max(1, next), this.totalPages());
    if (clamped !== this.safePage()) {
      this.pageChange.emit(clamped);
    }
  }

  onSizeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const size = Number(select.value);
    if (size > 0 && size !== this.pageSize()) {
      this.pageSizeChange.emit(size);
      this.pageChange.emit(1);
    }
  }
}

