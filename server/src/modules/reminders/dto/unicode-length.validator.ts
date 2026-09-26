import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

export function UnicodeLength(
  minimum: number,
  maximum: number,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'unicodeLength',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      constraints: [minimum, maximum],
      ...(validationOptions ? { options: validationOptions } : {}),
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          const length = Array.from(value).length;
          return length >= minimum && length <= maximum;
        },
        defaultMessage(arguments_: ValidationArguments): string {
          const [min, max] = arguments_.constraints as [number, number];
          return `${arguments_.property} must contain between ${min} and ${max} Unicode characters`;
        },
      },
    });
  };
}
