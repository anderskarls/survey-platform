-- FSRS-betyg på övningsförsök: 1=Om igen, 2=Svårt, 3=Bra, 4=Lätt (ts-fsrs Rating).
-- NULL = äldre försök från streak-eran; härleds vid replay (rätt->Bra, fel/osäker->Om igen).
ALTER TABLE "PracticeAttempt" ADD COLUMN "grade" SMALLINT;
