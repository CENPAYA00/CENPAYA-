
export interface PasswordValidation {
  valid: boolean;
  errors: string[];
}

export function validatePassword(
  password: unknown
): PasswordValidation {
  const errors: string[] = [];

  if (typeof password !== "string") {
    return {
      valid: false,
      errors: ["Password must be a string"]
    };
  }

  if (password.length < 12) {
    errors.push("Password must contain at least 12 characters");
  }

  if (password.length > 128) {
    errors.push("Password must not exceed 128 characters");
  }

  if (new TextEncoder().encode(password).length > 1024) {
    errors.push("Password is too large");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain a lowercase letter");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain an uppercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain a number");
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push("Password must contain a special character");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
