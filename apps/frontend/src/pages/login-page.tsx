import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../hooks/useAuth';
import { Button, Card, Input } from '../components/ui';
import { useNavigate } from 'react-router-dom';

const schema = z.object({
  email: z.email('Informe e-mail válido'),
  password: z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { login, loading } = useAuth();
  const { register, handleSubmit, formState: { errors }, setError } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: 'admin@contacarros.local',
      password: 'Admin@123',
    },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      await login(data.email, data.password);
      navigate('/dashboard');
    } catch {
      setError('root', { message: 'Falha no login' });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-md space-y-4">
        <h1 className="text-xl font-semibold">ContaCarros • Login</h1>
        <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <Input {...register('email')} placeholder="E-mail" type="email" className="w-full" />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>
          <div>
            <Input {...register('password')} placeholder="Senha" type="password" className="w-full" />
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
          </div>
          {errors.root && <p className="text-xs text-red-600">{errors.root.message}</p>}
          <Button type="submit" disabled={loading} className="w-full">Entrar</Button>
        </form>
      </Card>
    </div>
  );
}
