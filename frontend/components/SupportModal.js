import { useState } from "react";
import { trackEvent } from "@/utils/analytics";

export default function SupportModal() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  const openModal = () => {
    setOpen(true);
    trackEvent("support_chat_opened");
  };

  const closeModal = () => setOpen(false);

  const submitSupport = (e) => {
    e.preventDefault();
    trackEvent("support_message_sent", { messageLength: message.length });
    setMessage("");
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        onClick={openModal}
      >
        Help Chat
      </button>

      {open ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
            <h3 className="font-display text-lg font-semibold text-slate-900">Help and Support</h3>
            <p className="mt-1 text-sm text-slate-600">Ask any question about your application or offers.</p>
            <form className="mt-4 space-y-4" onSubmit={submitSupport}>
              <textarea
                className="h-28 w-full rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Type your question..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
