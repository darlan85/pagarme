import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import Payment from "App/Models/Payment";
import axios, {AxiosRequestConfig} from "axios";
// import {HttpContextContract} from "@ioc:Adonis/Core/HttpContext";
import {schema, rules} from "@ioc:Adonis/Core/Validator";

export default class PaymentsController {
    
    public async index(){
    
        const payments = await Payment.all()

        return payments

    }

    public async show({request, response}){

        const payment = await Payment.all()
        if(!payment){
            return response.status(403).json(
                {'message': 'No items to show.'}
            )
       }

       return response.status(200).json(
            {'items': payment}
        )
    }

    public async store({request, response}){

        // const res = request.input('amount')
        // return response.json([
        //     res
        // ])
        
        const validations = schema.create({
            description: schema.string.optional(), 
            amount: schema.number(), //transformar numero x100
            name: schema.string.optional(),
            email: schema.string.optional([rules.email()]),
            document: schema.string.optional(),
            area_code: schema.string.optional(), 
            phone_number: schema.string.optional()
        })

        try {
            const payload = await request.validate({
              schema: validations
            })
          } catch (error) {
            response.badRequest(error.messages)
          }
            
        const options: AxiosRequestConfig = {
            headers: {
                'Accept': 'application/json', 
                'Content-Type': 'application/json',
                'Authorization': 'Basic '+process.env.TOKEN
            }
        }

        try {
            const {data} = await axios.post(
                'https://api.pagar.me/core/v5/orders',
                {
                    items: [
                        {
                            amount: request.input('amount'),
                            description:request.input('description'),
                            quantity: "1"
                        }
                    ],
                    customer: {
                        name: request.input('name'),
                        email: request.input('email'),
                        type: "individual",
                        document: request.input('document') ,
                        phones: {
                            home_phone: {
                                country_code: "55",
                                number: request.input('phone_number'),
                                area_code: request.input('area_code')
                            }
                        }
                    },
                    payments: [
                        {
                            payment_method: "pix",
                            pix: {
                                expires_in: "86400",
                                additional_information: [
                                    {
                                        name: "quantidade",
                                        value: "1"
                                    }
                                ]
                            }
                        }
                    ]
                }, 
                options)

            const payment = await Payment.create({

                external_reference: data.charges[0].id,
                api_id: data.charges[0].id,
                status: data.charges[0].status
            })

            if(!payment){
                console.log('not found')
                return response.status(403).json('Payment not found')
            }

            return response.status(200).json({
                "message":"Pagamento criado com sucesso.",
                "qrcodebase64":"data:image/png;base64,"+data.charges[0].last_transaction.qr_code,
                "qrcode":data.charges[0].last_transaction.qr_code_url,
                "id":payment.id
            })

        } catch (error) {
            console.log(error.response.data)
            return response.status(403).json(error.response.data)
        }  
    }

    public async update(){

    }

    public async destroy(){

    }
    
    public async callback({request, response}){

        const res = request.only(['data'])
        const id = res.data.id

        console.log(id)

        const options: AxiosRequestConfig = {
            headers: {
                'Accept': 'application/json', 
                'Content-Type': 'application/json',
                'Authorization': 'Basic '+process.env.TOKEN
            }
        }

        try {

            const {data} = await axios.get(
                'https://api.pagar.me/core/v5/charges/'+id,
                options
            )

            if (data.status == 'paid') {
                
                const payment = await Payment.findBy('api_id', data.id)
                if(!payment){
                    return response.status(403).json(
                        'Payment Not Found'
                    )
                }

                if(payment.status == 'paid'){
                    return response.status(403).json(
                        'Payment already paid'
                    )
                }

                payment.status = data.status
                payment.save()

                return response.status(200).json(
                    'Payment realized successfully'
                )

            }else{
                return response.status(200).json(
                    'nothing to update'
                )
            }
            
        } catch (error) {
            console.log(error)
            return response.status(200).json(
                error
            )
            
        }
    }

    public async checkPayment({request, response}){

        const validations = schema.create({
            payment_ref: schema.number(), 
        })

        try {
            const payload = await request.validate({
              schema: validations
            })
          } catch (error) {
            response.badRequest(error.messages)
          }

        const id = request.input('payment_ref')
        
         const payment = await Payment.findBy('id', id)
         if(!payment){
            console.log('not found')
            return
        }

         if (payment.status == 'paid') {

            return response.status(200).json(
                {'status': true}
            )
         }else{
            return response.status(403).json(
                {'status': false}
            )
         }
    }

    public async cancelPayment({request, response}){

        
        const validations = schema.create({
            id: schema.number()
        })
        
        try {
            const payload = await request.validate({
                schema: validations
            })
        } catch (error) {
            response.badRequest(error.messages)
        }
        
        const id = request.input('id')
        
        const payment = await Payment.findBy('id', id)
        if(!payment){
            return response.status(403).json(
                {'status': 'Payment not found.'}
            )
       }

        if (payment.status == 'canceled') {
           return response.status(403).json(
               {'status': 'Payment already canceled.'}
           )
        }

        const options: AxiosRequestConfig = {
            headers: {
                'Accept': 'application/json', 
                'Content-Type': 'application/json',
                'Authorization': 'Basic '+process.env.TOKEN
            }
        }

        try {
            
            const {data} = await axios.delete(
                'https://api.pagar.me/core/v5/charges/'+payment.api_id,
                options
            )
                const pay = await Payment.findBy('api_id', data.id)
                if(!pay){
                    return response.status(403).json(
                        {'status': 'Payment not found.'}
                    )
                }

                payment.status = 'canceled'
                payment.save()

                return response.status(200).json(
                    {'message':'pagamento atualizado com sucesso.'}
                )
            
        } catch (error) {
            return response.status(403).json(
                error
            )
        }
   }
}
