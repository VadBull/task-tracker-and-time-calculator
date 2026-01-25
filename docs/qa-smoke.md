# Smoke checklist

> Use this checklist for quick manual validation when automated tests are unavailable or incomplete.

## Core flows
- [ ] App loads without errors in the console.
- [ ] Tasks list renders with existing data.
- [ ] New task can be created (title, planned minutes).
- [ ] Task can be edited and saved.
- [ ] Task can be deleted.
- [ ] Toggling done marks task as completed and sets actual minutes.

## Timer flows
- [ ] Start timer on a task; previous running timer stops.
- [ ] Timer shows accumulated time and can be stopped.
- [ ] Stopping timer updates actual minutes.

## Persistence & sync
- [ ] Page refresh keeps tasks (local state persists).
- [ ] Sync action completes without errors.
