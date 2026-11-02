-- Exact parity with additionPaymentText; existing saved proposal text is never rewritten.
create or replace function private.addition_payment_text(c jsonb) returns text
language plpgsql immutable set search_path=pg_catalog as $payment$
declare p jsonb:=c->'payment';pt boolean:=c->>'language'='PT';a text;b text;invoice text;activation text;reference text;
begin
 if coalesce(p->>'invoice','') not in ('award','split') or coalesce(p->>'activation','') not in ('full_payment','award_payment','on_award') then return case when pt then 'Condições de pagamento e ativação por definir.' else 'Payment and activation conditions have not been agreed yet.' end;end if;
 a:=case when (p->>'awardDueDays')::int=0 then case when pt then 'pronto pagamento' else 'due immediately' end else case when pt then 'pagamento a '||(p->>'awardDueDays')||' dias' else 'payment within '||(p->>'awardDueDays')||' days' end end;
 b:=case when (p->>'installationDueDays')::int=0 then case when pt then 'pronto pagamento' else 'due immediately' end else case when pt then 'pagamento a '||(p->>'installationDueDays')||' dias' else 'payment within '||(p->>'installationDueDays')||' days' end end;
 if p->>'invoice'='split' then
  invoice:=case when pt then 'Fatura de '||(p->>'awardPercent')||'% na adjudicação, '||a||'.'||chr(10)||'Fatura dos restantes '||(100-(p->>'awardPercent')::numeric)::text||'% na instalação, '||b||'.' else (p->>'awardPercent')||'% invoiced on award, '||a||'.'||chr(10)||'Remaining '||(100-(p->>'awardPercent')::numeric)::text||'% invoiced on installation, '||b||'.' end;
 else invoice:=case when pt then 'Fatura de 100% na adjudicação, '||a||'.' else '100% invoiced on award, '||a||'.' end;end if;
 activation:=case p->>'activation'
 when 'full_payment' then case when pt then 'Ativação após confirmação do pagamento integral.' else 'Activation after confirmation of full payment.' end
 when 'award_payment' then case when pt then 'Ativação após confirmação do pagamento da fatura de adjudicação.' else 'Activation after confirmation of the award invoice payment.' end
 else case when pt then 'Ativação após adjudicação e autorização das condições de crédito por HQ; sem exigir pagamento antecipado.' else 'Activation following award and HQ authorization of credit terms; advance payment is not required.' end end;
 reference:=case when p->>'reference' in ('Proposed conditions in this proposal','Proposed terms: 100% upfront; activation after full payment') then case when pt then 'Condições propostas neste documento, sujeitas a aceitação.' else 'Conditions proposed in this document, subject to acceptance.' end else (case when pt then 'Referência comercial' else 'Commercial reference' end)||': '||(p->>'reference') end;
 return invoice||chr(10)||activation||chr(10)||reference;
end $payment$;
