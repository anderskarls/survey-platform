/**
 * Ersätter knappraden när eleven försöker lämna in med obesvarade frågor.
 * Se src/lib/obesvarade.ts för varför - och för varför "Fortsätt svara"
 * står där Skicka svar stod.
 */
interface Props {
  obesvarade: number;
  totalt: number;
  submitting: boolean;
  onFortsatt: () => void;
  onLamnaIn: () => void;
}

export default function BekraftaInlamning({ obesvarade, totalt, submitting, onFortsatt, onLamnaIn }: Props) {
  return (
    <div className="bg-warning-light border border-warning/20 rounded-xl p-5" role="alertdialog" aria-labelledby="bekrafta-inlamning-rubrik">
      <p id="bekrafta-inlamning-rubrik" className="font-semibold">
        Du har inte svarat på {obesvarade} av {totalt} {totalt === 1 ? "fråga" : "frågor"}.
      </p>
      <p className="text-sm text-muted mt-1">
        Lämnar du in nu kan du inte fortsätta på dina svar efteråt.
      </p>
      <div className="flex gap-3 mt-4">
        <button
          type="button"
          onClick={onLamnaIn}
          disabled={submitting}
          className="btn-secondary py-3 px-5"
        >
          {submitting ? "Skickar..." : "Lämna in ändå"}
        </button>
        <button
          type="button"
          onClick={onFortsatt}
          disabled={submitting}
          className="btn-primary flex-1 py-3"
          autoFocus
        >
          Fortsätt svara
        </button>
      </div>
    </div>
  );
}
