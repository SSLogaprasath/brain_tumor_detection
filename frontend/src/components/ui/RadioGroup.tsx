interface RadioGroupOption {
  value: string;
  label: string;
  color?: string;
}

interface RadioGroupProps {
  label: string;
  name: string;
  options: RadioGroupOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export default function RadioGroup({
  label,
  name,
  options,
  value,
  onChange,
  error,
}: RadioGroupProps) {
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </legend>
      <div className="flex gap-4">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-2 cursor-pointer"
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className={`w-4 h-4 ${opt.color ? `text-${opt.color}-600` : "text-blue-600"}`}
            />
            <span className="text-sm text-gray-700">{opt.label}</span>
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </fieldset>
  );
}
