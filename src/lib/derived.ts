/**
 * space_id on blocks, tasks and time slots is derived by the database from the parent (DB-2, C-TRG-02),
 * but the generated insert types still ask for it. Pass this instead of a value the database ignores.
 */
export const DERIVED_SPACE_ID = undefined as unknown as string;
