-- Create invoice_installments table
CREATE TABLE IF NOT EXISTS public.invoice_installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id BIGINT REFERENCES public.quotes(id) ON DELETE CASCADE,
    due_date DATE NOT NULL,
    amount NUMERIC NOT NULL,
    amount_paid NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'late', 'partial')),
    reminded_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create invoice_payments table for transaction history
CREATE TABLE IF NOT EXISTS public.invoice_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id BIGINT REFERENCES public.quotes(id) ON DELETE CASCADE,
    installment_id UUID REFERENCES public.invoice_installments(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT DEFAULT 'transfer',
    reference TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID REFERENCES public.profiles(id)
);

-- Enable RLS
ALTER TABLE public.invoice_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

-- Policies for invoice_installments
CREATE POLICY "Users can view installments for their invoices"
    ON public.invoice_installments FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.quotes
        WHERE quotes.id = invoice_installments.quote_id
        AND quotes.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert installments for their invoices"
    ON public.invoice_installments FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.quotes
        WHERE quotes.id = invoice_installments.quote_id
        AND quotes.user_id = auth.uid()
    ));

CREATE POLICY "Users can update installments for their invoices"
    ON public.invoice_installments FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM public.quotes
        WHERE quotes.id = invoice_installments.quote_id
        AND quotes.user_id = auth.uid()
    ));

CREATE POLICY "Users can delete installments for their invoices"
    ON public.invoice_installments FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM public.quotes
        WHERE quotes.id = invoice_installments.quote_id
        AND quotes.user_id = auth.uid()
    ));

-- Policies for invoice_payments
CREATE POLICY "Users can view payments for their invoices"
    ON public.invoice_payments FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert payments for their invoices"
    ON public.invoice_payments FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update payments for their invoices"
    ON public.invoice_payments FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete payments for their invoices"
    ON public.invoice_payments FOR DELETE
    USING (auth.uid() = user_id);
