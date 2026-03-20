import { useState } from "react";
import { trackEvent } from "@/utils/analytics";

const sampleNotifications = [
  { id: 1, text: "Your loan is under review", destination: "application_status" },
  { id: 2, text: "New loan offer available", destination: "loan_offers" },
];

export default function NotificationsDropdown() {
  const [open, setOpen] = useState(false);

  const toggleOpen = () => {
    const nextValue = !open;
    setOpen(nextValue);
    if (nextValue) {
      trackEvent("notification_opened");
    }
  };

  const onNotificationClick = (item) => {
    trackEvent("notification_clicked", { destination: item.destination, text: item.text });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        Notifications
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {sampleNotifications.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNotificationClick(item)}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              {item.text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
