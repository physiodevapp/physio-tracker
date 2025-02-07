export interface checkbox {
  label: string;
  value: string;
  defaultChecked?: boolean; // Si es true (o está sin definir), el checkbox se marcará por defecto
  disabled?: boolean; // Si es true, el checkbox no será editable
}