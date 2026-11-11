import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.css',
})
export class ContactComponent {
  name = '';
  phone = '';
  email = '';
  topic = 'Booking Support';
  bookingRef = '';
  message = '';

  readonly errorMsg = signal('');
  readonly submittedTicket = signal<{
    ticketId: string;
    name: string;
    email: string;
    topic: string;
  } | null>(null);

  readonly openFaq = signal<number | null>(0);
  readonly faqs = [
    {
      q: 'How fast does the Beautiva concierge respond?',
      a: 'Messages submitted here or sent to concierge@beautiva.ng are answered within 1 hour during studio hours (8:00 AM to 8:00 PM WAT, Monday through Sunday).',
    },
    {
      q: 'I have a BK-2026 booking ID and need to reschedule—what should I do?',
      a: 'Include your BK-2026-XXXXXX reference in the form above or visit the Tracking page first to confirm your current slot and studio contact details.',
    },
    {
      q: 'How can my salon, barbershop, or studio join Beautiva?',
      a: 'You can publish your own auto-generated studio website immediately from the Vendor Dashboard (/vendor) or message us here for guided onboarding in Lagos or Abuja.',
    },
  ];

  submitInquiry(): void {
    this.errorMsg.set('');
    if (!this.name.trim() || !this.phone.trim() || !this.email.trim() || !this.message.trim()) {
      this.errorMsg.set('Please fill in your name, phone number, email, and message.');
      return;
    }

    const ticketId = `INQ-${Math.floor(100000 + Math.random() * 900000)}`;
    this.submittedTicket.set({
      ticketId,
      name: this.name.trim(),
      email: this.email.trim(),
      topic: this.topic,
    });
  }

  resetForm(): void {
    this.name = '';
    this.phone = '';
    this.email = '';
    this.bookingRef = '';
    this.message = '';
    this.submittedTicket.set(null);
  }
}
